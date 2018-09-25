const 
util = require('util'),
redis = require('redis');

module.exports.KEY_DBX_GALLERY_CURSOR = 'dbx_gallery_cursor',
module.exports.KEY_DBX_GALLERY_HAS_MORE = 'dbx_gallery_has_more',
module.exports.KEY_DBX_SEARCH_CURSOR = 'dbx_search_cursor',
module.exports.KEY_LAST_MODIFIED_TIMESTAMP = 'last_modified_timestamp',
module.exports.PREFIX_PERSONID = 'personId:';

client = redis.createClient();
module.exports.setAsync = util.promisify(client.set).bind(client);
module.exports.getAsync = util.promisify(client.get).bind(client);