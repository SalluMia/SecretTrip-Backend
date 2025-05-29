const express = require('express');
const auth = require('../middlewares/auth');
const homeController = require('../controllers/home.controller');

const router = express.Router();

router.use(auth);

router.get('/activetrips-activemissions', homeController.getHome);

module.exports = router;
