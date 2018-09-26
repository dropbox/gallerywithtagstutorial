require('dotenv').config({silent: true});

const 
rp = require('request-promise'),
config = require('./config'),
store = require('./redismodel');

//creates a new Person Group on Azure
module.exports.createGroupAsync = ()=>{
  let options={
    method: 'PUT',
    url: 'https://'+config.AZURE_LOCATION+'.'+config.AZURE_FACE_ROUTE+'/persongroups/'+config.AZURE_PERSON_GROUP_ID,
    headers:{'Ocp-Apim-Subscription-Key':process.env.AZURE_COGNITIVE_KEY},
    json:true,
    body:{'name':config.AZURE_PERSON_GROUP_DESC}
  }
  return rp(options);
}

//Adds a person to the group and trains images 
module.exports.addPersonToPersonGroupAsync = async (displayName,facePaths) =>{
  //Construct a basic request options object used across calls with Face API 
  let options = {};
  options.headers = {'Ocp-Apim-Subscription-Key':process.env.AZURE_COGNITIVE_KEY};
  options.json = true;
  options.method = 'POST';

  //First, try to create a person and add it to the Person Group.
  //this will give us back a personID
  let personId;
  let personGroupId = config.AZURE_PERSON_GROUP_ID;

  try{
 
    displayName = displayName.toLowerCase();

    options.url = 'https://'+config.AZURE_LOCATION+'.'+config.AZURE_FACE_ROUTE+'/persongroups/'+personGroupId+'/persons';
    options.body = {"name":displayName};

    let result = await rp(options);

    //If person added to the group a PersonID is created
    personId = result.personId;

  }catch(error){
    throw(new Error("Error adding "+displayName+" Message:"+error.message));
  }

  //Now try to add the faces for that person 
  options.url = 'https://'+config.AZURE_LOCATION+'.'+config.AZURE_FACE_ROUTE+'/persongroups/'+personGroupId+'/persons/'+personId+'/persistedFaces';  
  let addedFacesCount=0;

  for(let i = 0; i < facePaths.length; i++){
    try{
      options.body = {'url':facePaths[i]};
      await rp(options);
      addedFacesCount++;
    }catch(error){
      console.log("Error: Failed to add face for URL:"+facePaths[i]+"\n"+error.message);
      //ignore errors and continue with the other pictures
    }
  }

  if(addedFacesCount == 0) throw(new Error("Couldn't add any of the faces"));

  //Train the model
  try{
    options.url = 'https://'+config.AZURE_LOCATION+'.'+config.AZURE_FACE_ROUTE+'/persongroups/'+personGroupId+'/train';
    options.body = null;
    await rp(options);
  }catch(error){
    throw(new Error("Error training model after adding user "+displayName+" Message:"+error.message));
  }

  //store the displayName for that personId
  try{
    await store.setAsync(store.PREFIX_PERSONID + personId, displayName);
  }catch(error){
    throw(new Error("Couldn't add "+displayName+" to local store. Message:"+error.message));
  }

  //A person has successfully been added and model has been trained
  console.log(displayName + " added with personID=" + personId);

}

/*
Resolves with all the people from a personGroup on a picture
The returned value is an array of personIds 
*/
module.exports.detectPersonsInPhotoAsync = async (photoURL) =>{
  try{

    let options = {
      method: 'POST',
      url: 'https://'+config.AZURE_LOCATION+'.'+config.AZURE_FACE_ROUTE+'/detect',
      headers:{'Ocp-Apim-Subscription-Key':process.env.AZURE_COGNITIVE_KEY},
      json:true,
      body:{'url':photoURL}
    }

    //Detect all the faces in the url
    let response = await rp(options);

    //put only the faceIds into a single array
    let faceIds = response.map(function (entry) {
      return entry.faceId;
    });

    //if no faces found on the picture return with an empty array
    if(!faceIds || faceIds.length == 0) return [];

    //per detect method limitation
    if(faceIds.length > 10) throw (new Error("More than 10 people in picture"));

    //Check the people those faces belong to in the  personGroup
    options.url = 'https://'+config.AZURE_LOCATION+'.'+config.AZURE_FACE_ROUTE+'/identify',
    options.body = {    
      "personGroupId":config.AZURE_PERSON_GROUP_ID,
      "faceIds":faceIds,
      "maxNumOfCandidatesReturned":1, //only one candidate per face
      "confidenceThreshold": 0.5
    }

    response = await rp(options);

    //retrieve all the persons identified in the picture as an array of personIds
    let personIds = [];
    for (let i=0; i < response.length; i++){
      if(response[i].candidates.length > 0){
        personIds.push(response[i].candidates[0].personId);
      }
    }

    return personIds;

  }catch(error){
    throw(new Error("Error detecting people in photo. "+error.message));
  }
}