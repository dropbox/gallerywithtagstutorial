const 
dbxservices = require('./dbxservices'),
azureservices = require('./azureservices');

module.exports.addPeopletoGroup = async()=>{

  //define people to add
  let people_to_add = [
    {name: 'Drew Houston', path: '/photos/training/drew'},
    {name: 'Arash Ferdowsi', path: '/photos/training/arash'},
  ]

  //create group first
  try{

    await azureservices.createGroupAsync();
    console.log("azure group created");

  }catch(error){
    //abort with any error except group exists
    if(error.code && error.code != 'PersonGroupExists'){
      console.log("-->  Aborting ...");
      return console.log(error);
    }
  }

  for (let i = 0; i < people_to_add.length; i++){

    let person = people_to_add[i];
    try{
      //get temporary links for images on each persons folder
      let imgs = await dbxservices.getTemporaryLinksForFolderAsync(person.path,null);
      
      //add each person to the group
      await azureservices.addPersonToPersonGroupAsync(person.name,imgs.temporaryLinks);

    }catch(error){
      console.log("couldn't add "+person.name+" trying with next person.  Message:"+error.message);
    } 
  }
  console.log("-> Script finished.  Use Ctrl+C to return to terminal");
}