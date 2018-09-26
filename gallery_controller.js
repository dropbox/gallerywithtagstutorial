const 
dbxservices = require('./dbxservices'),
config = require('./config'),
store = require('./redismodel');

//Renders the gallery UI with the first set of images
//It always starts over and resets cursors
module.exports.gallery = async (req,res,next)=>{  

  let photos_path = config.DROPBOX_PHOTOS_FOLDER;
  let limit = config.DROPBOX_LIST_FOLDER_LIMIT;

  try{

    let result = await dbxservices.getTemporaryLinksForFolderAsync(photos_path,limit,null);  
    let tmp_links_paths = result.temporaryLinks;

    await store.setAsync(store.KEY_DBX_GALLERY_CURSOR,result.cursor);
    await store.setAsync(store.KEY_DBX_GALLERY_HAS_MORE,result.has_more);

    if(tmp_links_paths.length > 0){
      res.render('gallery', { imgs: tmp_links_paths, layout:false});
    }else{
      //if no images, ask user to upload some
      return next(new Error("No images found in the " + photos_path + " folder"));
    }  
        
  }catch(error){
    return next(error);
  }
}

//Called to fetch the next set of images
module.exports.gallery_continue = async (req,res,next)=>{
  try{

    //if no more elements, return an empty array
    if(!await store.getAsync(store.KEY_DBX_GALLERY_HAS_MORE)) return res.send([]);

    let cursor = await store.getAsync(store.KEY_DBX_GALLERY_CURSOR);

    let result = await dbxservices.getTemporaryLinksForCursorAsync(cursor,null);  

    await store.setAsync(store.KEY_DBX_GALLERY_CURSOR,result.cursor);
    await store.setAsync(store.KEY_DBX_GALLERY_HAS_MORE,result.has_more);

    res.send(result.temporaryLinks);

  }catch(error){
    res.status(500).send(error.message);
  }
}  

//Displays a gallery with search results
module.exports.search = async (req, res, next)=>{
  try{

    if (typeof req.query.search == 'undefined'){
      return next(new Error("no search arguments"));
    }

    let name = req.query.search.toLowerCase();

    //Search for results with that name
    let result = await dbxservices.searchPropertiesAsync(name);

    //save cursor in local storage  
    await store.setAsync(store.KEY_DBX_SEARCH_CURSOR,result.cursor);

    let temporaryLinks = [];
    let showing_results = "No results for: "+name;
    if(result.paths.length>0){
      //For all the paths returned, create temporarylinks
      temporaryLinks = await dbxservices.getTemporaryLinksForPathsAsync(result.paths);
      showing_results = "Showing results for: "+name;
    }
    res.render('gallery', { imgs: temporaryLinks, showing_results:showing_results, layout:false});
  }catch(error){
    return next(error);
  }
}

//called to get the next set of results
module.exports.search_continue = async (req, res, next)=>{
  try{

    let cursor = await store.getAsync(store.KEY_DBX_SEARCH_CURSOR);
    if(!cursor)return res.send([]);//if no more results, return

    let result = dbxservices.searchPropertiesFromCursorAsync(cursor);

    //save cursor in local storage
    await store.setAsync(store.KEY_DBX_SEARCH_CURSOR,result.cursor);

    let temporaryLinks = [];
    if(result.paths.length>0){
      //For all the paths returned, create temporarylinks
      temporaryLinks = await dbxservices.getTemporaryLinksForPathsAsync(result.paths);
    }
    res.send(temporaryLinks);
  }catch(error){
    res.status(500).send(error.message);
  }
}  