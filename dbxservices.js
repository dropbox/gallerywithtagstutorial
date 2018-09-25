//load environment variables
require('dotenv').config({silent: true});
//Dropbox SDK requires this line
require('isomorphic-fetch'); 

const
Dropbox = require('dropbox').Dropbox;

var dbx = new Dropbox({ accessToken: process.env.DBX_TOKEN});

/*
Returns an array with temporary links from a folder path
Only links for image files are returned.
Resolves with a esponse in the following format:
{
  temporaryLinks: [link1,link2,link3],
  paths:[path1,path2,path3],
  cursor: cursor,
  has_more: True/False
}
*/
module.exports.getTemporaryLinksForFolderAsync = async (folder_path,limit,lastModified)=>{
  try{   

    let params = {};
    params.path = folder_path;
    if(limit){params.limit = limit;}

    let result = await dbx.filesListFolder(params);
    let returnValue = await filterDropboxResultAsync(result,lastModified);

    return returnValue;

  }catch(error){
    throw(new Error("couldnt get temporary links. " + getDbxErrorMsg(error)));
  }
}

//Same as getTemporaryLinksForFolderAsync but takes a cursor instead of path
//Resolves with the same values
module.exports.getTemporaryLinksForCursorAsync = async (cursor,lastModified) =>{
  try{  

    let result = await dbx.filesListFolderContinue({"cursor":cursor});
    let returnValue = await filterDropboxResultAsync(result,lastModified);
    
    return returnValue;
    
  }catch(error){
    throw(new Error("couldnt get temporary links. " + getDbxErrorMsg(error)));
  }
}

//Internal function that filters a Dropbox result
async function filterDropboxResultAsync(result,lastModified){
  try{

    let returnValue = {};

    //Get cursor to fetch more pictures
    returnValue.cursor = result.cursor;
    returnValue.has_more = result.has_more;

    let imgPaths = [];
    for(let i = 0; i < result.entries.length; i++) {
      entry = result.entries[i];
      if(lastModified && entry.server_modified < lastModified) continue;
      if(entry.path_lower.search(/\.(gif|jpg|jpeg|tiff|png)$/i) == -1) continue;
      
      imgPaths.push(entry.path_lower);
    }

    //Get a temporary link for each of those paths returned
    let temporaryLinks= await getTemporaryLinksForPathsAsync(imgPaths);

    returnValue.temporaryLinks= temporaryLinks;
    returnValue.imgPaths = imgPaths;

    return returnValue;

  }catch(error){
    throw(new Error("couldnt filter result. " + getDbxErrorMsg(error)));
  }
}

//Internal function to get an array with temp links from an array with paths
async function getTemporaryLinksForPathsAsync(imgPaths){
  try{

    let promises = [];

    //Create a promise for each path and push it to an array of promises
    imgPaths.forEach((path_lower)=>{
      promises.push(dbx.filesGetTemporaryLink({"path":path_lower}));
    });

    //when all promises are fulfilled a result is built in an ordered fashion
    let result = await Promise.all(promises);

    //Construct a new array only with the link field of the result
    let temporaryLinks = result.map(function (entry) {
      return entry.link;
    });

    return temporaryLinks;

  }catch(error){
    throw(new Error("couldnt create temporary links. " + getDbxErrorMsg(error)));
  }
}
//makes the above function available outside of this file with same name
module.exports.getTemporaryLinksForPathsAsync = getTemporaryLinksForPathsAsync;

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