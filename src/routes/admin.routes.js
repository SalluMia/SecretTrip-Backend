const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');
const paymentController=require('../controllers/payment.controller')


router.get('/get-privacy-policy', adminController.getPrivacyPolicy);

router.use(auth);      
router.use(isAdmin);  

// Dashboard
router.get('/dashboard', adminController.getDashboardAnalytics);

// Users Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id/status', adminController.toggleUserStatus);

// Trip Records Management
router.get('/trips', adminController.getAllTrips);
// router.get('/trips', adminController.getFullTripDetail);
router.get('/trips/details/:tripId', adminController.getFullTripDetail);
router.post('/download-pdf', adminController.downloadPDFByPath);

// Package Management
router.post('/packages', adminController.createPackage);
router.get('/packages', adminController.getAllPackages);
router.put('/packages/:id', adminController.updatePackage);
router.delete('/packages/:id', adminController.deletePackage);
router.put('/packages/:id/status', adminController.togglePackageStatus);

// Mission Template Management
router.post('/mission-templates', adminController.createMissionTemplate);
router.get('/mission-templates', adminController.getAllMissionTemplates);
router.get('/mission-templates/:id', adminController.getMissionTemplateById);
router.put('/mission-templates/:id', adminController.updateMissionTemplate);
router.delete('/mission-templates/:id', adminController.deleteMissionTemplate);

// Privacy Policy Management
router.post('/privacy-policy', adminController.createPrivacyPolicy);
router.get('/privacy-policy', adminController.getPrivacyPolicy);
router.put('/privacy-policy', adminController.updatePrivacyPolicy);
router.delete('/privacy-policy', adminController.deletePrivacyPolicy);

router.get('/payments/analytics', adminController.getPaymentAnalytics);
router.post('/albums/generate/:tripId', adminController.generateAlbum);
router.post('/payments/:paymentId/refund', adminController.refundPayment);
router.post('/trips/:tripId/activate-manual', adminController.manuallyActivateTrip);


router.get('/payment/analytics', paymentController.getAdminRevenueAnalytics);

// Storage Management
router.post('/cleanup-orphaned-photos', adminController.cleanupOrphanedPhotos);

module.exports = router;
