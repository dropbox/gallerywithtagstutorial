//load environment variables
require('dotenv').config({silent: true});
//Dropbox SDK requires this line
require('isomorphic-fetch'); 

const
Dropbox = require('dropbox').Dropbox,
template = require ('./property_group_template'),
store = require('./redismodel');

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

//Returns a Template Id from local storage or gets a new one and stores it 
module.exports.getTemplateIDAsync = async ()=>{
  try{
    
    let template_id = await store.getAsync("property_group_template_id");
    if (!template_id){
      let result = await dbx.filePropertiesTemplatesAddForUser(template.property_group_template);
      template_id = result.template_id;
      await store.setAsync("property_group_template_id",template_id);
    }
    return template_id;

  }catch(error){
    throw(new Error("couldn't get templateID. " + getDbxErrorMsg(error)));
  }
}

//Adds a set of properties to a specific file, if it exists overwrites it
module.exports.addPropertiesAsync = async (templateId,path,names)=>{
  
  let property_group_object = buildPropertyGroup(names,path,templateId);

  try{

    let result = await dbx.filePropertiesPropertiesAdd(property_group_object);

  }catch(error){

    let tag = null;

    //if error from Dropbox, get the .tag field
    if (typeof error.error.error['.tag'] !== 'undefined'){
      tag = error.error.error['.tag'];
    }

    //If the property exists, overwrite it 
    if(tag == "property_group_already_exists"){
      try{

        console.log("property exist, overwriting");
        await dbx.filePropertiesPropertiesOverwrite(property_group_object);

      }catch(error){
        throw(new Error("Error overwriting properties. " + getDbxErrorMsg(error)))
      }
    }else{
      throw(new Error("Error adding properties to user. " + getDbxErrorMsg(error)));
    }
  }
}

//returns a property group as a json object
function buildPropertyGroup(names,path,templateId){
  //construct array with persons found according to template
  let fields = [];
  for(let i = 0; i < names.length; i++){
    fields.push({'name': 'person' + (i), 'value':names[i]})
  }

  return {
    "path": path,
    "property_groups": [{
      "template_id": templateId,
      "fields": fields
    }]
  }
}

/*
Searchs for a property using a name 
Resolves with an object with the following structure
{
  paths: [path1,path2,path3],
  cursor: cursor
}
an empty cursor means there are no more results
*/
module.exports.searchPropertiesAsync = async (name)=>{
  try{

    //build the query iterating on each personId and possible value
    //E.g. two personIs will create 10 queries
    let query= {};
    query.template_filter = 'filter_none';
    query.queries = [];
    let max = template.property_group_template.fields.length;

    for(let i = 0; i < max; i++){
      let single_query =  {
        "query": name,
        "mode": {".tag": "field_name","field_name": "person" + i},
        "logical_operator": "or_operator"
      }
      query.queries.push(single_query);  
    }

    let result = await dbx.filePropertiesPropertiesSearch(query);
    let returnValue = filterPropertySearchResult(result);
    return returnValue;

  }catch(error){
    throw(new Error("Error searching properties. " + getDbxErrorMsg(error)));
  } 
}

//Same as searchPropertiesAsync but continues the search with a cursor
module.exports.searchPropertiesFromCursorAsync = async (cursor) =>{
  try{
    
    let result = await dbx.filePropertiesPropertiesSearchContinue({"cursor":cursor});
    let returnValue = filterPropertySearchResult(result);
    return returnValue;

  }catch(error){
    throw(new Error("Error searching properties. " + getDbxErrorMsg(error)));
  }
}

// Fapi.tsilters results from a property search 
function filterPropertySearchResult(result){

  let returnValue = {};
  returnValue.cursor = (typeof result.cursor !== 'undefined')?result.cursor:'';

  //Construct a new array only with the path field if file is not deleted
  let paths = [];

  for(let i = 0; i < result.matches.length; i++){
    let entry = result.matches[i];    
    if(!entry.is_deleted){
      paths.push(entry.path);
    }
  }

  returnValue.paths= paths;
  return returnValue;
}