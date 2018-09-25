var express = require('express');
var router = express.Router();
const gallery_controller = require('../gallery_controller');

//Gets an html page with a subset of all the pictures in a folder
router.get('/gallery', gallery_controller.gallery);

//Gets an array with the next subset of pictures for a folder
router.get('/gallery/continue', gallery_controller.gallery_continue);

//Gets an html page with a subset of pictures of a search
router.get('/gallery/search', gallery_controller.search);

//Gets an array with the next subset of pictures of a previous search
router.get('/gallery/search/continue', gallery_controller.search_continue);

module.exports = router;
