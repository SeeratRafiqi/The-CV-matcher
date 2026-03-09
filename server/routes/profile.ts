import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { profileController } from '../controllers/profileController.js';
import { authenticateToken, requireCandidate, requireCompany } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const photosDir = path.join(uploadsDir, 'photos');
const logosDir = path.join(uploadsDir, 'logos');
const cvsDir = path.join(uploadsDir, 'cvs');

[uploadsDir, photosDir, logosDir, cvsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer config for photo uploads
const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const imageFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
  }
};

const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB for photos
});

const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB for logos
});

// ==================== CANDIDATE PROFILE ====================
router.get(
  '/candidate/profile',
  authenticateToken,
  requireCandidate,
  (req, res) => profileController.getCandidateProfile(req as any, res)
);

router.put(
  '/candidate/profile',
  authenticateToken,
  requireCandidate,
  express.json(),
  (req, res) => profileController.updateCandidateProfile(req as any, res)
);

router.post(
  '/candidate/profile/photo',
  authenticateToken,
  requireCandidate,
  uploadLimiter,
  uploadPhoto.single('photo'),
  (req, res) => profileController.uploadCandidatePhoto(req as any, res)
);

router.delete(
  '/candidate/profile/photo',
  authenticateToken,
  requireCandidate,
  (req, res) => profileController.deleteCandidatePhoto(req as any, res)
);

router.post(
  '/candidate/profile/photo/remove',
  authenticateToken,
  requireCandidate,
  (req, res) => profileController.deleteCandidatePhoto(req as any, res)
);

// ==================== CANDIDATE CV UPLOAD (self) ====================
const cvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, cvsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const uniqueName = `${name}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const cvFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const isValidMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
  const isValidExt = path.extname(file.originalname).toLowerCase() === '.pdf';
  if (isValidMime || isValidExt) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

const uploadCv = multer({
  storage: cvStorage,
  fileFilter: cvFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for CVs
});

router.post(
  '/candidate/cv/upload',
  authenticateToken,
  requireCandidate,
  uploadLimiter,
  uploadCv.single('file'),
  (req, res) => profileController.uploadCandidateCv(req as any, res)
);

router.post(
  '/candidate/cv/rerun',
  authenticateToken,
  requireCandidate,
  (req, res) => profileController.rerunCandidateMatching(req as any, res)
);

// ==================== PRIVACY SETTINGS ====================
router.get(
  '/candidate/profile/privacy',
  authenticateToken,
  requireCandidate,
  (req, res) => profileController.getPrivacySettings(req as any, res)
);

router.put(
  '/candidate/profile/privacy',
  authenticateToken,
  requireCandidate,
  express.json(),
  (req, res) => profileController.updatePrivacySettings(req as any, res)
);

// ==================== COMPANY PROFILE ====================
router.get(
  '/company/profile',
  authenticateToken,
  requireCompany,
  (req, res) => profileController.getCompanyProfile(req as any, res)
);

router.put(
  '/company/profile',
  authenticateToken,
  requireCompany,
  express.json(),
  (req, res) => profileController.updateCompanyProfile(req as any, res)
);

router.post(
  '/company/profile/logo',
  authenticateToken,
  requireCompany,
  uploadLimiter,
  uploadLogo.single('logo'),
  (req, res) => profileController.uploadCompanyLogo(req as any, res)
);

export default router;
