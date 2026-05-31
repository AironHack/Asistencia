const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { autenticar } = require('../../shared/auth.middleware');
const { asyncHandler } = require('../../shared/async-handler');

router.post('/login', asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.get('/me', autenticar, asyncHandler(authController.me));
router.post('/logout', autenticar, asyncHandler(authController.logout));

module.exports = router;
