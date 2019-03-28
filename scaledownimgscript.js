/*
This script helps to scale down images above a limit of bytes in a folder.
To use it, change the parameters 
FOLDER_PATH 
LIMIT_SIZE (in bytes)

and run using this command:
node -e 'require("./scaledownimgscript").run()'

*/


//token will be read from .env file
require('dotenv').config({silent: true});

//Dropbox SDK requires this line
require('isomorphic-fetch'); 
const Dropbox = require('dropbox').Dropbox;

//Folder in Dropbox for images to be resampled
const FOLDER_PATH = '/photos';

//Results per each pagination event in Dropbox
const PAGINATION_SIZE = 20;

//Anything beyond this limit will be resized to the options below
const LIMIT_SIZE = 6000000;


//Options to download an scaled down version of the images in the FOLDER_PATH
//https://www.dropbox.com/developers/documentation/http/documentation#files-get_thumbnail
var download_params = {
  format: 'jpeg',
  size : 'w2048h1536',
  mode: 'bestfit'
}

var upload_params = {
  autorename: true,
  mute: true
}


//Scales down all the images in the FOLDER_PATH
module.exports.run = async () =>{
  try{

    let dbx = new Dropbox({ accessToken: process.env.DBX_TOKEN});

    let cursor = false;
    let has_more = true;
    let counter = 0;

    while(has_more){

      let result= null;

      if(!cursor){
        result = await imgsOverSizeInFolder(dbx);
      }else{
        result = await imgsOverSizeForCursor(dbx, cursor);
      }

      cursor = result.cursor;
      has_more = result.has_more;


      for(let i = 0; i < result.imgPaths.length; i++){

        let path = result.imgPaths[i];

        //donwloads a lower resolution version of the file
        download_params.path = path;
        let response = await dbx.filesGetThumbnail(download_params);

        console.log("downloaded lower res image");

        //uploads the file to Dropbox in the same folder
        //the picture will be added the _lowres sufix
        upload_params.contents = response.fileBinary;
        upload_params.path = path.substr(0, path.lastIndexOf('.')) + '_lowres.jpg';

        response = await dbx.filesUpload(upload_params);

        console.log("uploaded new image as "+ upload_params.path);

        //moves original file to a /highres folder within the folder of origin
        let move_params = {};
        move_params.from_path = path;
        //regex for the last / in the path
        move_params.to_path = path.replace(/\/(?!.*\/)/, "/highres/");
        move_params.autorename = true;
        response = await dbx.filesMoveV2(move_params);

        console.log(path + " moved to " + response.metadata.path_lower);

        counter++;

      } 
    }

    console.log("Finished resizing " + counter + " images");
    
  }catch(error){
    console.log(error);
  }
  console.log("-> Script finished.  Use Ctrl+C to return to terminal");
}


async function imgsOverSizeInFolder(dbx){
  try{   

    let params = {};
    params.path = FOLDER_PATH;
    params.limit = PAGINATION_SIZE;

    let result = await dbx.filesListFolder(params);
    let returnValue = await filterDropboxResultAsync(result);

    return returnValue;

  }catch(error){
    throw(new Error("couldnt get paths for images in folder. " + getDbxErrorMsg(error)));
  }
}

async function imgsOverSizeForCursor(dbx,cursor){
  try{  

    let result = await dbx.filesListFolderContinue({"cursor":cursor});
    let returnValue = await filterDropboxResultAsync(result);
    
    return returnValue;
    
  }catch(error){
    throw(new Error("couldnt get paths for images with cursor. " + getDbxErrorMsg(error)));
  }
}

async function filterDropboxResultAsync(result){
  try{

    let returnValue = {};

    //Get cursor to fetch more pictures
    returnValue.cursor = result.cursor;
    returnValue.has_more = result.has_more;

    //Filter result to images only
    let entriesFiltered = result.entries.filter(function(entry){
      return entry.path_lower.search(/\.(gif|jpg|jpeg|tiff|png)$/i) > -1;
    });  

    //Filter result to files bigger than limit size
    entriesFiltered = result.entries.filter(function(entry){
      return entry.size > LIMIT_SIZE;
    });  

    //Get an array from the entries with only the path_lower fields
    let imgPaths = entriesFiltered.map(function (entry) {
      return entry.path_lower;
    });

    returnValue.imgPaths = imgPaths;

    return returnValue;

  }catch(error){
    throw(new Error("couldnt filter result. " + getDbxErrorMsg(error)));
  }
}

//Gets an error message from an error potentially comming from Dropbox
function getDbxErrorMsg(error){
  if(typeof error.message == 'string'){
    return error.message;
  }
  else if(typeof error.error == 'string'){
    return error.error;
  }
  else if (typeof error.error.error_summary == 'string'){
    return error.error.error_summary;
  }else{
    return null;
  }
}


