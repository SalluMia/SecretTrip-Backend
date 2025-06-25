// src/services/album.service.js
const { prisma } = require('../config/prisma');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const notificationService = require('./notification.service');

function initializeDirectories() {
  const dirs = [
    path.join(__dirname, '../uploads/albums'),
    path.join(__dirname, '../uploads/albums/standard'),
    path.join(__dirname, '../uploads/albums/hd')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

initializeDirectories();

exports.generateTripAlbum = async function(tripId) {
  try {
    console.log(`📸 Generating album for trip ${tripId}...`);

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: { select: { id: true, displayName: true } },
        tripAliases: true,
        assignedMissions: {
          where: { completed: true, photoUrl: { not: null } },
          include: { user: { select: { displayName: true } } },
          orderBy: { submittedAt: 'asc' }
        }
      }
    });

    if (!trip) throw new Error('Trip not found');
    if (trip.assignedMissions.length === 0) throw new Error('No completed missions with photos found');

    const standardPdfPath = await exports.createPDF(trip, 'standard');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const album = await prisma.album.create({
      data: {
        tripId: trip.id,
        pdfUrl: `/uploads/albums/standard/${path.basename(standardPdfPath)}`,
        expiresAt,
        createdAt: new Date()
      }
    });

    for (const member of trip.members) {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      try {
        await notificationService.sendAlbumReadyNotification({
          userId: member.id,
          tripName: trip.name,
          alias,
          albumId: album.id
        });
      } catch (notifError) {
        console.error('Failed to send album notification:', notifError);
      }
    }

    console.log(`✅ Album generated for trip "${trip.name}" with ${trip.assignedMissions.length} photos`);

    return {
      albumId: album.id,
      standardPdfUrl: album.pdfUrl,
      photoCount: trip.assignedMissions.length,
      expiresAt: album.expiresAt
    };
  } catch (error) {
    console.error('Error generating trip album:', error);
    throw error;
  }
};

exports.generateHDVersion = async function(albumId) {
  try {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        trip: {
          include: {
            members: true,
            tripAliases: true,
            assignedMissions: {
              where: { completed: true, photoUrl: { not: null } },
              include: { user: { select: { displayName: true } } },
              orderBy: { submittedAt: 'asc' }
            }
          }
        }
      }
    });

    if (!album) throw new Error('Album not found');
    if (album.pdfHDUrl) return album.pdfHDUrl;

    const hdPdfPath = await exports.createPDF(album.trip, 'hd');

    const updatedAlbum = await prisma.album.update({
      where: { id: albumId },
      data: {
        pdfHDUrl: `/uploads/albums/hd/${path.basename(hdPdfPath)}`
      }
    });

    return updatedAlbum.pdfHDUrl;
  } catch (error) {
    console.error('Error generating HD version:', error);
    throw error;
  }
};

exports.getAlbumAccess = async function(tripId, userId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: { some: { id: userId } }
    }
  });

  if (!trip) throw new Error('Trip not found or access denied');

  const album = await prisma.album.findUnique({ where: { tripId } });

  if (!album) {
    return { available: false, message: 'Album is being generated...' };
  }

  const now = new Date();
  const hasHDAccess = Boolean(album.pdfHDUrl);
  const freeAccessExpired = album.expiresAt && now > album.expiresAt;

  return {
    available: true,
    albumId: album.id,
    standardPdfUrl: freeAccessExpired ? null : album.pdfUrl,
    hdPdfUrl: hasHDAccess ? album.pdfHDUrl : null,
    hasHDAccess,
    freeAccessExpired,
    expiresAt: album.expiresAt,
    canUpgradeToHD: !hasHDAccess,
    hdPrice: 2.99,
    currency: 'EUR'
  };
};

exports.createPDF = async function(trip, quality = 'standard') {
  try {
    const filename = `album_${trip.id}_${quality}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, `../uploads/albums/${quality}`, filename);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Secret Trip - ${trip.name}`,
        Author: 'Secret Trip App',
        Subject: 'Photo Album',
        Creator: 'Secret Trip'
      }
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    await exports.addCoverPage(doc, trip);
    await exports.addMissionPhotos(doc, trip, quality);
    await exports.addStatisticsPage(doc, trip);
    await exports.addCreditsPage(doc, trip);

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    console.log(`📄 PDF created: ${filename} (${quality})`);
    return outputPath;
  } catch (error) {
    console.error('Error creating PDF:', error);
    throw error;
  }
};

exports.addCoverPage = async function(doc, trip) {
  try {
    doc.fontSize(32)
       .font('Helvetica-Bold')
       .fillColor('#667eea')
       .text('SECRET TRIP', 40, 100, { align: 'center' });

    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text(trip.name, 40, 160, { align: 'center' });

    const startDate = new Date(trip.startDate).toLocaleDateString('fr-FR');
    const endDate = new Date(trip.endDate).toLocaleDateString('fr-FR');

    doc.fontSize(16)
       .font('Helvetica')
       .fillColor('#666')
       .text(`${startDate} - ${endDate}`, 40, 200, { align: 'center' });

    const completedMissions = trip.assignedMissions.length;
    const totalMembers = trip.members.length;

    doc.fontSize(14)
       .text(`${completedMissions} missions accomplies`, 40, 250, { align: 'center' })
       .text(`${totalMembers} agents secrets`, 40, 270, { align: 'center' });

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('ÉQUIPE D\'AGENTS:', 40, 320, { align: 'center' });

    let yPos = 350;
    trip.members.forEach(member => {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      doc.fontSize(11)
         .font('Helvetica')
         .text(`${alias} (${member.displayName})`, 40, yPos, { align: 'center' });
      yPos += 20;
    });

    doc.fontSize(48)
       .font('Helvetica')
       .fillColor('#f0f0f0')
       .text('🕵️‍♂️', 40, 500, { align: 'center' });

    doc.fontSize(10)
       .fillColor('#999')
       .text('Généré par Secret Trip App', 40, 750, { align: 'center' });

    doc.addPage();
  } catch (error) {
    console.error('Error adding cover page:', error);
  }
};

exports.addMissionPhotos = async function(doc, trip, quality) {
  try {
    const pageWidth = doc.page.width - 80;
    const pageHeight = doc.page.height - 120;

    let currentY = 40;

    for (let i = 0; i < trip.assignedMissions.length; i++) {
      const mission = trip.assignedMissions[i];

      if (currentY > pageHeight - 300) {
        doc.addPage();
        currentY = 40;
      }

      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#333')
         .text(mission.title, 40, currentY);

      currentY += 20;

      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#666')
         .text(mission.instruction, 40, currentY, { width: pageWidth });

      currentY += 30;

      try {
        const photoPath = path.join(__dirname, '../uploads/mission-photos', path.basename(mission.photoUrl));

        if (fs.existsSync(photoPath)) {
          const processedImagePath = await exports.processImageForPDF(photoPath, quality);

          const maxWidth = pageWidth * 0.8;
          const maxHeight = 300;

          doc.image(processedImagePath, 40, currentY, {
            fit: [maxWidth, maxHeight],
            align: 'center'
          });

          currentY += maxHeight + 20;

          const photographer = mission.user.displayName;
          const submittedDate = new Date(mission.submittedAt).toLocaleDateString('fr-FR');

          doc.fontSize(9)
             .fillColor('#999')
             .text(`Par ${photographer} • ${submittedDate}`, 40, currentY);

          currentY += 30;

          if (mission.caption) {
            doc.fontSize(10)
               .fillColor('#555')
               .text(`"${mission.caption}"`, 40, currentY, {
                 width: pageWidth,
                 style: 'italic'
               });
            currentY += 25;
          }

          if (processedImagePath !== photoPath) {
            try {
              fs.unlinkSync(processedImagePath);
            } catch (err) {
              console.error('Error cleaning up processed image:', err);
            }
          }
        } else {
          doc.fontSize(10)
             .fillColor('#999')
             .text('Photo non disponible', 40, currentY);
          currentY += 20;
        }
      } catch (imageError) {
        console.error('Error adding image to PDF:', imageError);
        doc.fontSize(10)
           .fillColor('#999')
           .text('Erreur lors du chargement de la photo', 40, currentY);
        currentY += 20;
      }

      currentY += 20;
    }
  } catch (error) {
    console.error('Error adding mission photos:', error);
  }
};

exports.processImageForPDF = async function(imagePath, quality) {
  try {
    const outputPath = imagePath.replace(path.extname(imagePath), `_pdf_${quality}.jpg`);

    const sharpInstance = sharp(imagePath);

    if (quality === 'hd') {
      await sharpInstance
        .resize(1200, 800, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 95 })
        .toFile(outputPath);
    } else {
      await sharpInstance
        .resize(800, 600, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 75 })
        .toFile(outputPath);
    }

    return outputPath;
  } catch (error) {
    console.error('Error processing image for PDF:', error);
    return imagePath;
  }
};

exports.addStatisticsPage = async function(doc, trip) {
  try {
    doc.addPage();

    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#667eea')
       .text('STATISTIQUES DE LA MISSION', 40, 60, { align: 'center' });

    let yPos = 120;

    const stats = [
      `Missions accomplies: ${trip.assignedMissions.length}`,
      `Agents participants: ${trip.members.length}`,
      `Durée du voyage: ${exports.calculateTripDuration(trip.startDate, trip.endDate)} jours`
    ];

    stats.forEach(stat => {
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#333')
         .text(stat, 40, yPos);
      yPos += 25;
    });

    yPos += 20;

    const categoryStats = exports.calculateCategoryStats(trip.assignedMissions);

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('Répartition par catégorie:', 40, yPos);
    yPos += 30;

    Object.entries(categoryStats).forEach(([category, count]) => {
      const categoryName = category === 'AESTHETIC' ? 'Esthétique' : 'Agent Secret';
      doc.fontSize(12)
         .font('Helvetica')
         .text(`${categoryName}: ${count} missions`, 60, yPos);
      yPos += 20;
    });

    yPos += 30;

    const contributors = exports.calculateTopContributors(trip.assignedMissions, trip.tripAliases);

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('Agents les plus actifs:', 40, yPos);
    yPos += 30;

    contributors.slice(0, 5).forEach((contributor, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
      doc.fontSize(12)
         .font('Helvetica')
         .text(`${medal} ${contributor.alias}: ${contributor.count} missions`, 60, yPos);
      yPos += 20;
    });
  } catch (error) {
    console.error('Error adding statistics page:', error);
  }
};

exports.addCreditsPage = async function(doc, trip) {
  try {
    doc.addPage();

    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#667eea')
       .text('REMERCIEMENTS', 40, 60, { align: 'center' });

    const messages = [
      'Merci à tous les agents qui ont participé à cette mission secrète !',
      '',
      'Chaque photo raconte une histoire, chaque mission accomplie',
      'renforce l\'esprit d\'équipe et crée des souvenirs inoubliables.',
      '',
      'Continuez à explorer le monde et à capturer des moments magiques !',
      '',
      '🕵️‍♂️ Mission accomplie avec succès 🕵️‍♀️'
    ];

    let yPos = 150;
    messages.forEach(message => {
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#333')
         .text(message, 40, yPos, { align: 'center', width: doc.page.width - 80 });
      yPos += 25;
    });

    doc.fontSize(10)
       .fillColor('#999')
       .text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 40, 700, { align: 'center' })
       .text('Secret Trip App - www.secrettrip.app', 40, 720, { align: 'center' });
  } catch (error) {
    console.error('Error adding credits page:', error);
  }
};

// Helper methods

exports.calculateTripDuration = function(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

exports.calculateCategoryStats = function(missions) {
  const stats = {};
  missions.forEach(mission => {
    stats[mission.category] = (stats[mission.category] || 0) + 1;
  });
  return stats;
};

exports.calculateTopContributors = function(missions, aliases) {
  const userCounts = {};

  missions.forEach(mission => {
    userCounts[mission.userId] = (userCounts[mission.userId] || 0) + 1;
  });

  return Object.entries(userCounts)
    .map(([userId, count]) => {
      const alias = aliases.find(a => a.userId === userId)?.alias || 'Agent';
      return { userId, alias, count };
    })
    .sort((a, b) => b.count - a.count);
};
