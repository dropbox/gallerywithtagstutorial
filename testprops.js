const dbxservices = require('./dbxservices');
const setTimeoutAsync = util.promisify(setTimeout);

module.exports.testProperties = async()=>{

  try{

    let template_id = await dbxservices.getTemplateIDAsync();
    console.log("Template ID:"+template_id);

    console.log("setting properties");
    await dbxservices.addPropertiesAsync(template_id,
                                          '/photos/sample1.jpg',['Arash','Drew']);
    await dbxservices.addPropertiesAsync(template_id,
                                          '/photos/sample2.jpg',['Drew']);
    console.log("properties set");

    //wait 3 seconds before searching for properties
    await setTimeoutAsync(3000);

    console.log("Searching for properties with the name: Drew");
    let result = await dbxservices.searchPropertiesAsync('Drew');

    console.log("found files:");
    console.log(result);

  }catch(error){
    console.log(error);
  }
  console.log("-> Script finished.  Use Ctrl+C to return to terminal");
}