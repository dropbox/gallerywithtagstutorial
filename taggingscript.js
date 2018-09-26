const 
dbxservices = require('./dbxservices'),
azureservices = require('./azureservices'),
config = require('./config'),
store = require('./redismodel');

//version of setTimeout for FACE API throttling  purposes
const setTimeoutAsync = util.promisify(setTimeout);
const THROTTLING_WAIT = 6000;  //six seconds wait

module.exports.tag = async(tagall)=>{
  try{

    let last_modified = null;

    if(!tagall){
      last_modified = await store.getAsync(store.KEY_LAST_MODIFIED_TIMESTAMP);
      if(last_modified)console.log("tagging imgs added after "+last_modified);
    }

    let hasmore = true;
    let cursor = null;
    let folder_path = config.DROPBOX_PHOTOS_FOLDER;
     
    while(hasmore){

      //get paths for all the images on the folder
      let result = null;
      if(!cursor){
        //can be changed to allow more results per iteration
        let limit = config.DROPBOX_LIST_FOLDER_LIMIT;
        //first first set of results
        result = await dbxservices.getTemporaryLinksForFolderAsync(folder_path,limit,last_modified);  
      }else{
        result = await dbxservices.getTemporaryLinksForCursorAsync(cursor,last_modified);
      }

      cursor = result.cursor;
      hasmore = result.has_more;
      let temporaryLinks = result.temporaryLinks;
      let imgPaths = result.imgPaths;

      console.log("tagging a set of " + temporaryLinks.length + " images");

      for(let i = 0; i < temporaryLinks.length; i++){
        try{

          //the following two lines throttle the 20 req per min limit of Face API
          //the detectPersonsInPhotoAsync makes 2 calls to the API
          console.log(" waiting ...");
          await setTimeoutAsync(THROTTLING_WAIT); //waits a number of seconds for next call

          //get all the peopleIDs on the photo being iterated
          let peopleIds = await azureservices.detectPersonsInPhotoAsync(temporaryLinks[i]);

          if(peopleIds.length == 0) continue;

          //retrieve all the names corresponding to the personIds
          let names = [];
          for(let j = 0; j < peopleIds.length; j++){
            let name = await store.getAsync(store.PREFIX_PERSONID +peopleIds[j]);
            names.push(name);
          }
          
          if(names.length == 0) continue; 

          //get the templateID and add properties to that photo
          let templateID = await dbxservices.getTemplateIDAsync();
          await dbxservices.addPropertiesAsync(templateID,imgPaths[i],names);

          console.log("tagged: " + imgPaths[i] + " with " + names.length + " names");

        }catch(error){
          console.log("Couldn't tag image " + imgPaths[i] + " Message:" + error.message);
        }
      }
    }

    let dateIsoString = (new Date()).toISOString();
    await store.setAsync(store.KEY_LAST_MODIFIED_TIMESTAMP,dateIsoString);
    console.log("tagging complete");

  }catch(error){
    console.log("Couldn't tag images");
    console.log(error);
  }
  console.log("-> Script finished.  Use Ctrl+C to return to terminal");
}