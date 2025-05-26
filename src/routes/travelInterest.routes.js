const express = require('express');
const {
  createInterest,
  getAllInterests,
  deleteInterest,
  updateInterest,
} = require('../controllers/travelInterest.controller');

const auth = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

// Admin only
router.post('/create', auth, isAdmin, createInterest);
router.get('/getAll', getAllInterests); 
router.put('/update/:id', auth, isAdmin, updateInterest);
router.delete('/delete/:id', auth, isAdmin, deleteInterest);

module.exports = router;
