// src/services/scalewayStorage.service.js
const { ScalewayApi, ScalewayApiRegion } = require('@scaleway/sdk');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ScalewayStorageService {
  constructor() {
    this.accessKeyId = process.env.SCALEWAY_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.SCALEWAY_SECRET_ACCESS_KEY;
    this.region = process.env.SCALEWAY_REGION || 'nl-ams';
    this.bucketName = process.env.SCALEWAY_BUCKET_NAME || 'secret-trip-storage';
    
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('Scaleway credentials not configured. Please set SCALEWAY_ACCESS_KEY_ID and SCALEWAY_SECRET_ACCESS_KEY environment variables.');
    }

    // Initialize S3 client for Scaleway Object Storage
    this.s3Client = new S3Client({
      region: this.region,
      endpoint: `https://s3.${this.region}.scw.cloud`,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      forcePathStyle: true, // Required for Scaleway
    });

    console.log('✅ Scaleway Storage Service initialized');
  }

  /**
   * Upload a file to Scaleway Object Storage
   * @param {Buffer|Stream} fileBuffer - File buffer or stream
   * @param {string} fileName - Name of the file
   * @param {string} folder - Folder path (e.g., 'profile-photos', 'mission-photos', 'albums')
   * @param {string} contentType - MIME type of the file
   * @returns {Promise<Object>} Upload result with URL and key
   */
  async uploadFile(fileBuffer, fileName, folder = 'uploads', contentType = 'application/octet-stream') {
    try {
      const key = `${folder}/${Date.now()}_${uuidv4()}_${fileName}`;
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read', // Make files publicly accessible for public bucket
      });

      await this.s3Client.send(command);
      
      // For public buckets, use direct URL with proper encoding
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.scw.cloud/${encodeURIComponent(key)}`;
      
      console.log(`✅ File uploaded successfully: ${fileUrl}`);
      
      return {
        success: true,
        url: fileUrl, // Return direct URL for public access
        key: key,
        bucket: this.bucketName,
        region: this.region
      };
    } catch (error) {
      console.error('❌ Error uploading file to Scaleway:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Upload file with exact filename (no timestamp/UUID added)
   * Used for profile photos that need consistent filenames
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - Exact file name
   * @param {string} folder - Folder path
   * @param {string} contentType - MIME type
   * @returns {Promise<Object>} Upload result with URL and key
   */
  async uploadFileExact(fileBuffer, fileName, folder = 'uploads', contentType = 'application/octet-stream') {
    try {
      const key = `${folder}/${fileName}`;
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read', // Make files publicly accessible for public bucket
        CacheControl: 'public, max-age=31536000' // Cache for 1 year
      });

      await this.s3Client.send(command);
      
      // For public buckets, use direct URL with proper encoding
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.scw.cloud/${encodeURIComponent(key)}`;
      
      console.log(`✅ File uploaded successfully with exact filename: ${fileUrl}`);
      
      return {
        success: true,
        url: fileUrl, // Return direct URL for public access
        key: key,
        bucket: this.bucketName,
        region: this.region
      };
    } catch (error) {
      console.error('❌ Error uploading file to Scaleway:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Upload a local file to Scaleway
   * @param {string} localFilePath - Path to local file
   * @param {string} folder - Folder path
   * @param {string} customFileName - Custom file name (optional)
   * @returns {Promise<Object>} Upload result
   */
  async uploadLocalFile(localFilePath, folder = 'uploads', customFileName = null) {
    try {
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`Local file not found: ${localFilePath}`);
      }

      const fileName = customFileName || path.basename(localFilePath);
      const fileBuffer = fs.readFileSync(localFilePath);
      const contentType = this.getContentType(fileName);

      return await this.uploadFile(fileBuffer, fileName, folder, contentType);
    } catch (error) {
      console.error('❌ Error uploading local file:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Scaleway Object Storage
   * @param {string} key - File key in bucket
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log(`✅ File deleted successfully: ${key}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting file:', error);
      return false;
    }
  }

  /**
   * Get a signed URL for private file access
   * @param {string} key - File key in bucket
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      throw error;
    }
  }

  /**
   * Get a fresh signed URL for a file (useful when URLs expire)
   * @param {string} fileUrl - The original file URL
   * @param {number} expiresIn - Expiration time in seconds (default: 7 days)
   * @returns {Promise<string>} Fresh signed URL
   */
  async getFreshSignedUrl(fileUrl, expiresIn = 7 * 24 * 3600) {
    try {
      const key = this.extractKeyFromUrl(fileUrl);
      if (!key) {
        throw new Error('Invalid file URL - could not extract key');
      }
      
      return await this.getSignedUrl(key, expiresIn);
    } catch (error) {
      console.error('❌ Error generating fresh signed URL:', error);
      throw error;
    }
  }

  /**
   * Check if a file exists in the bucket
   * @param {string} key - File key in bucket
   * @returns {Promise<boolean>} File existence status
   */
  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Extract key from Scaleway URL
   * @param {string} url - Full Scaleway URL
   * @returns {string} File key
   */
  extractKeyFromUrl(url) {
    if (!url) return null;
    
    // Handle different URL formats
    const patterns = [
      new RegExp(`https://${this.bucketName}\\.s3\\.${this.region}\\.scw\\.cloud/(.+)`),
      new RegExp(`https://s3\\.${this.region}\\.scw\\.cloud/${this.bucketName}/(.+)`)
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get content type based on file extension
   * @param {string} fileName - File name
   * @returns {string} MIME type
   */
  getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.txt': 'text/plain',
      '.json': 'application/json',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Generate a unique filename with timestamp and UUID
   * @param {string} originalName - Original file name
   * @param {string} prefix - Optional prefix
   * @returns {string} Unique filename
   */
  generateUniqueFileName(originalName, prefix = '') {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    
    return `${prefix}${prefix ? '_' : ''}${timestamp}_${uuid}_${name}${ext}`;
  }
}

// Create singleton instance
const scalewayStorage = new ScalewayStorageService();

module.exports = scalewayStorage;
