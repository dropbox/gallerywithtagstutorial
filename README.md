# A Dropbox image gallery with tags
By Ruben Rincon, August 2018

In our [previous tutorial](https://dropbox.github.io/nodegallerytutorial/), we showed how to create a gallery application using Node.js, Express, and Dropbox, and how to deploy it to Heroku  

In this tutorial, we’ll expand the prior gallery application by adding the capability to search for pictures on Dropbox using tags. We’ll use the Microsoft Azure Face Recognition API to add tags for specific people, and the Dropbox File Properties API to hold references to those tags.

We’ll use the Dropbox [JavaScript SDK](https://github.com/dropbox/dropbox-sdk-js) to simplify and reduce the amount of code we need to write along the way, as well as pagination of Dropbox results to deal with large number of files.

## Project scope

We'll be limiting pictures to hold up to 5 different tags. This can be easily changed in the code. It doesn’t mean tagging is limited to 5 people, but instead, one single picture will only store 5 faces.

For simplicity, this tutorial will not cover the authentication part. Authentication and session management were described in the [previous tutorial](https://dropbox.github.io/nodegallerytutorial/).  To test this application with your own Dropbox account, you will need to create your own application in the Dropbox Developer console and obtain an access token.

This code is organized assuming that you will be using [git](https://git-scm.com/) as your version control system.

💡  If you simply want to run the code, go to the bottom of this tutorial to section 6:  ***I just want to run the code***.


## Source code

🎯 Along the project you will find the corresponding source code for each section. You can also find the full source code of the project in [GitHub](https://github.com/dropbox/gallerywithtagstutorial)


## Sample images

We also provide the sample images used in this tutorial. You can get them along the source code in the **photos.zip** file or directly get them from [this link](https://github.com/dropbox/gallerywithtagstutorial/blob/master/photos.zip).


## Project structure

In the [previous tutorial](https://dropbox.github.io/nodegallerytutorial/) we provided some explanation about how Express projects are organized and separate the front end (what the user will see) and backend (business logic and data storage). If you haven’t already done it, it is a good idea to revisit section 1 and 2. You can also find more information about those terms on [Wikipedia](https://en.wikipedia.org/wiki/Front_and_back_ends).  

In this tutorial the back end logic will be managed by the following components:


- **gallery_controller:**  responsible for the logic of rendering the gallery of images and search as well as returning additional images to be rendered 
- **dbxservices:**  manages communication with Dropbox
- **azureservices:**  manages communication with Azure
- **redismodel:**  communication to Redis database 

Same as in the previous tutorial, we will be using [*handlebars*](https://handlebarsjs.com/) as the template engine.


# 1.  Setting up the project 🛠️ 


## Dropbox app

We'll first need to create a Dropbox app. To do that you need a Dropbox account. If you don’t have one, create it at www.dropbox.com, then complete the steps below:


1. Go to the Dropbox [App Console](https://www.dropbox.com/developers/apps)
2. Click on create app
3. On the app page, select Dropbox API
4. Select Full Dropbox access (Note that the Dropbox File Properties API requires “Full Dropbox” scope.)
![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1532653350010_Screen+Shot+2018-07-26+at+6.02.02+PM.png)

## Creating the project structure

We'll start by creating an empty project using Express generator (installation covered in section 1 of [previous tutorial](https://dropbox.github.io/nodegallerytutorial/)).

    express  tagmyphotos --view=hbs

followed by …

    cd tagmyphotos

then install all the components with the following command …

    npm install


## Configuration

We'll be adding three helping files:


- **config.js:**  configuration data and constant values used across the application
- **.env:**  holds keys and secrets of different services like Dropbox and Azure.  This file should not be synced to cloud code repositories.  Instead, whenever you want to deploy it, each deployment service such as Heroku or AWS has its own secure way to enter these values.
- **.gitignore:**  indicates which files will not get synced to the code repository

To avoid hardcoding sensitive information we will use the **dotenv** library.  When the node environment is started, it will fill the values in the .env file into the current process, and we can retrieve those values using `process.env.<variable>`

    npm install dotenv --save

Now create the following two files at the project root level with the following content:

**.gitignore**

```javascript
# Node build artifacts
node_modules
npm-debug.log

# Local development
*.env
package-lock.json
```

Create an .env file with the following content:

**.env** 

    DBX_TOKEN='<dropbox app token>'

You can get the access token from Dropbox using the developer console. Open the app you previously created and find the  *Generate access token* section, copy the token and replace it in the .env file.


![](https://d2mxuefqeaa7sj.cloudfront.net/s_AF59FB1D5BA399D3113B27383DC0CD3B8C78F4E2C07A96878E95182825482A54_1531961701591_Screen+Shot+2018-07-18+at+5.53.56+PM.png)


Finally, create the config file that will hold some configuration information, such as the path to the folder that contains the pictures and how many pictures will be returned when listing the contents of a folder.

**config.js**
```javascript
module.exports = {
  DROPBOX_PHOTOS_FOLDER:'/photos',
  DROPBOX_LIST_FOLDER_LIMIT: 5,
}
```


## Installing Redis database

Same as in the [previous tutorial](https://dropbox.github.io/nodegallerytutorial/), we'll use Redis database to store a few important values in a persistent way, this will save us from several roundtrips to Dropbox and Azure, as well as helping us to keep a local dictionary of people who have been tagged on the pictures we want to search later.

Redis database can be obtained [here](https://redis.io/download).  Once you unpack it, open a separate terminal, go to the redis folder and run.  

```javascript
src/redis-server
```

your terminal will look like this:

![](https://d2mxuefqeaa7sj.cloudfront.net/s_5BE384A0B772773EE7D3916BE412587034AC125EC6921B15EF4FEE7C88E3A55D_1505834587527_Screen+Shot+2017-09-19+at+8.22.45+AM.png)


Now, you will need to add the `redis` package to your project.


    npm install redis --save

You can **optionally** launch an additional terminal window and use the [Redis cli](https://redis.io/topics/rediscli) to manually add/remove/check information stored in the database.


    src/redis-cli

You can use the cli to run any of the [redis commands](https://redis.io/commands) directly.

**☕ And now we are all set to code …** 

To begin, create a **/photos** folder on the same Dropbox account where you created the app and add some images there (or download the samples from [this link](https://github.com/dropbox/gallerywithtagstutorial/blob/master/photos.zip))


# 2.  A Dropbox gallery with a search bar

Similar to the previous tutorial, we'll be writing code that doesn’t block the server but can be written in a synchronous fashion. This means that the next line of code will not be executed until there is a response back.  In the meantime, the server can process other requests or execute other pending tasks.

To do this, we will use ES7 [async](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)[/](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)[await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function); the [Dropbox JavaScript SDK](https://github.com/dropbox/dropbox-sdk-js), which returns Promises for all the methods; and a new utility on Node 8  [util.promisify](https://nodejs.org/dist/latest-v8.x/docs/api/util.html#util_util_promisify_original) that allows us to convert standard callback-ended methods into Promises (methods that receive a callback as the last parameter and execute it when complete). 


## Redis hooks

We will be using the Redis database in the beginning to store cursors for pagination, later to store cursors related to a search result, as well as a dictionary of names of people tagged on pictures.

We will use a single entry point for Redis that we will call **redismodel.js** to manipulate simple get/set key pairs.  We will also place on this file the different keys that will be used to store values. As Redis uses standard callbacks, we will promisify a few methods using `util.promisify()`.  Now add the following file to your project at the root level:

**redismodel.js**

```javascript
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
```

Notice that we use `bind(client)`  which fixes an issue with Redis and the `.this` reference as mentioned in [this thread](https://stackoverflow.com/questions/44815553/use-node-redis-with-node-8-util-promisify).


## Galleria

In the same way as in the [previous tutorial](https://dropbox.github.io/nodegallerytutorial/), we will use Galleria to render Dropbox images nicely.
First download the Galleria library [from this link](https://galleria.io/get-started/) and uncompress it.  Then copy the galleria folder inside the **/public** folder. Your folder structure should look like the image below:
 

![Public folder after decompressing galleria](https://d2mxuefqeaa7sj.cloudfront.net/s_5BE384A0B772773EE7D3916BE412587034AC125EC6921B15EF4FEE7C88E3A55D_1511593965387_Screen+Shot+2017-11-24+at+11.12.23+PM.png)


Now create the template file  **/views/gallery.hbs** and copy the code that contains the gallery page including a simple (but nice) search bar.

**/views/gallery.hbs**

```html
<!DOCTYPE html>
<html>
<head>                       
  <script type='text/javascript' src='https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js'></script>
  <script src="/galleria/galleria-1.5.7.min.js"></script>
  <script type='text/javascript' src='/javascripts/gallery.js'></script>
  <link rel="stylesheet" href="/stylesheets/gallery.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
</head>
<body>
  <div class="topnav">
    <span id="showing-results">{% raw %}{{showing_results}}{% endraw %}</span>
    <div class="search-container">
      <form action="/gallery/search" id="form">
        <input type="text" placeholder="Search.." name="search" id="query">
        <button type="submit"><i class="fa fa-search"></i></button>
      </form>
    </div>
  </div>
  <div class="galleria">{% raw %}
    {{#each imgs}}
    <img src="{{this}}">
    {{/each}}{% endraw %}
  </div>
</body>
</html>
```

You can see in the body part that we iterate through the `imgs` object passed creating HTML code with an image tag per array element.  Additionally, there is a  `showing_results` element that is only passed during a search result to display the current search query.  

The JavaScript file will have some logic for pagination.  When a user has reached the last image loaded on the gallery using the right arrow, it will fetch more results to display from the server and insert them into the current set of images.  By default, it will try to fetch more results for the folder in Dropbox that is being observed, but if the gallery is currently displaying search results, it will fetch the next subset of results for that specific search.  Finally, it will also have some simple logic to avoid sending empty search queries to the server. So add the the **public/javascripts/gallery.js** file to your project.
 
**public/javascripts/gallery.js**

```javascript
jQuery(document).ready(function(){

  //load galleria
  Galleria.loadTheme('/galleria/themes/classic/galleria.classic.min.js');
  Galleria.run('.galleria');

  //called when an img is loaded on the main display area of the screen
  Galleria.on('image', function(e) {

    //these are galleria functions
    let imgsLeft = this.getDataLength() - this.getIndex();

    //if in the last image, bring a new set of images
    if(imgsLeft == 1){

      //url depends on being a search result or a normal gallery display
      let url = ($("#showing-results").text() != '')
              ?'/gallery/search/continue':'/gallery/continue';

      $.ajax({
         url: url,
         type: 'GET',
         success: (response)=>{
            response.forEach((imgSrc)=>{
              this.push({image:imgSrc});
            });
         },
         error: (jqXHR)=>{
          console.log("error "+jqXHR.responseText);
         }
        });
      }
  });

  //don't send empty search queries to the server
  $("#form").submit(function(event) {
    if($("#query").val()=='' )event.preventDefault();
  });
});
```
 
And now add the CSS for the gallery page which also includes the style for the search navigation bar:

**public/stylesheets/gallery.css** 

```css
.galleria{
  max-width: 100%;
  min-height: 700px;
  height: 500px;
  margin: 0 auto;
}

.topnav {
  overflow: hidden;
  background-color: #e9e9e9;
}

.topnav .search-container {
  float: right;
}

.topnav input[type=text] {
  padding: 6px;
  margin-top: 8px;
  margin-bottom: 8px;
  font-size: 17px;
  border: none;
}

.topnav span {
  float: left;
  display: block;
  color: black;
  text-align: center;
  padding: 14px 16px;
  text-decoration: none;
  font-size: 17px;
}

.topnav .search-container button {
  float: right;
  padding: 6px 10px;
  margin-top: 8px;
  margin-right: 16px;
  background: #ddd;
  font-size: 17px;
  border: none;
  cursor: pointer;
}

.topnav .search-container button:hover {
  background: #ccc;
}
```
 

##  Routing requests on the server

There will be 4 different entry points in the server defined in the **routes/index.js** file. Two of them will return an html page with a subset of images (which are actually links to temporary images), while the other two are used for pagination of results and will return an array with the next subset of links to images.  The router file connects the entry points with a corresponding method in the **gallery_controller**.
 
Replace the **routes/index.j**s with the following content:
 
**routes/index.js**

```javascript
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
```
 

## Writing the gallery controller and connecting to Dropbox

The logic for any route that touches the gallery will be located in `gallery_controller.js` and any call to Dropbox will be in the `dbxservices.js`  For Dropbox communication, we will be using the [DropboxJavaScript SDK](https://github.com/dropbox/dropbox-sdk-js).  


## Dropbox JavaScript SDK

  
The next step is to install the Dropbox [JavaScript SDK](https://github.com/dropbox/dropbox-sdk-js), which will need the isomorphic-fetch library as well.


    npm install dropbox isomorphic-fetch --save


## Pagination 

 
When users want to see all the pictures in a folder,  they will reach the **/gallery** endpoint and the  `gallery` method in the **gallery_controler.js** is executed.  The controller calls `dbxservices.getTemporaryLinksForFolderAsync()` method and obtains an array of temporary links from Dropbox along with a cursor which is stored in Redis (so the gallery can fetch more images by calling **/gallery/continue)**.  The controller creates an HTML page with those links and sends it as a response.  The set of links created are valid for a period of 4 hours, as the **dbxservices** creates a temporary link for each picture to be displayed. 

When users navigate to the last image in the gallery, they will call the  **/gallery/continue** endpoint, which will execute the `gallery_continue` method in **gallery_controler.js**.  This method retrieves the last cursor stored in Redis and uses the `dbxservices.getTemporaryLinksForCursorAsync()` method to get the next set of temporary links along with a newer cursor.  The cursor in Redis gets replaced and the server replies with an array of temporary links for the next subset of images.

**gallery_controller.js**

```javascript
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

module.exports.search = async (req,res,next)=>{
  res.send("not implemented");
}

module.exports.search_continue = async (req,res,next)=>{
  res.send("not implemented");
}
```

And the logic to manage communication with Dropbox …

**dbxservices.js**

```javascript
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
```

## Source code

🎯 You can find all the code up to this point [here](https://github.com/dropbox/gallerywithtagstutorial/tree/gallery-only)

And you should be ready to run the code using:


    npm start

Now, go to http://localhost:3000/gallery

And it should look like the image below (notice the search bar on the top right).  Also, if you reach the last image, give it one or two seconds and you should see more results.


![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1534482123608_Screen+Shot+2018-08-16+at+10.01.22+PM.png)



# 3. Dropbox File Properties 

File properties are metadata that can be added to a file that is specific to the Dropbox application that created it, meaning an app can write it and read it but no other apps can.  

We will use the File Properties API to write tags to each picture of the people contained in it.  In addition to reading and writing, the File Properties API provides a means to search, which we will use later to search for specific people.

The way this works is that a File can have several Property Groups.  Each Property Group contains a number of PropertyFields. The Property Group is defined using a Template, which indicates the field names and value types associated with each group.  

The image below shows the concept of Property Groups on the left, the Property Group Template in the middle and on the right a specific sample in the same way used on this tutorial.


![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1534555320121_Screen+Shot+2018-08-17+at+6.21.01+PM.png)


Let’s start with the Template.  For this, we will create a JavaScript file with a JSON object containing the Template that we will use later on.  To make it simpler to iterate, we will add 5 people starting from person0 to person4.  This means that each file can have up to 5 tags.  You can change this if you want just by adding more fields to this Template.

Add to your project the file **property_group_template.js** at the root of the project.

**property_group_template.js**

```javascript
module.exports.property_group_template = {
  name: "tags",
  description:"Picture tags",
  fields: [
    {"name":"person0" , "description":"first person tagged", "type":"string"},
    {"name":"person1" , "description":"second person tagged", "type":"string"},
    {"name":"person2" , "description":"third person tagged", "type":"string"},
    {"name":"person3" , "description":"fourth person tagged", "type":"string"},
    {"name":"person4" , "description":"fifth person tagged", "type":"string"}    
  ]
}
```

To avoid some back and forth with Dropbox retrieving the Template ID, we will create a Template the first time that it’s needed; then, the Template ID will be saved into the Redis database. Add the following code to the **dbxservices.js** file:

**dbxservices.js**

```javascript
const
template = require ('./property_group_template'),
store = require('./redismodel');

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
```

For adding the respective property group to a file, we use an array of names and we create a structure based on the template in the `buildPropertyGroup()` method. As each picture can have up to 5 people tagged, the property group will have up to 5 property fields.  

From the Dropbox JavaScript SDK, we use the method `filePropertiesPropertiesAdd` to add the property group to the picture. In case it already has that property group (tagging the same picture again), we will catch the error from Dropbox and use instead `filePropertiesPropertiesOverwrite`.

**dbxservices.js**

```javascript
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
```

Finally, this won’t be complete without the search part to retrieve files with a specific property. 
File properties API allows us to search for a specific name+value property field combination.  As a name can be located in any of the 5 tag slots and even in two photos with the same people the order may be different,  we will need to search for different combinations per each person.

To explain this better, imagine we have two pictures: `sample1.jpg` and `sample2.jpg`, that include the Dropbox founders Drew and Arash. The file properties on those files would look like this:

![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1534485134921_Screen+Shot+2018-08-16+at+10.51.50+PM.png)


If we want all the pictures where Drew appears, we would need to query the name “Drew” in each of the possible fields in the following way.

```javascript
{ 
  "queries":[  
      {  
         "query":"Drew",
         "mode":{  
            ".tag":"field_name",
            "field_name":"person0"
         },
         "logical_operator":{  
            ".tag":"or_operator"
         }
      },
      {  
         "query":"Drew",
         "mode":{  
            ".tag":"field_name",
            "field_name":"person1"
         }
      }
   ],
   "template_filter":{  
      ".tag":"filter_none"
   }
}
```

and the result to the above query will be:

```javascript
{
  "matches": [
    {
      "id": "id:LbvtH3Oi_JAAAA12345678",
      "path": "/photos/sample1.jpg",
      "is_deleted": false,
      "property_groups": [
        {
          "template_id": "ptid:CxfoMQJzjBAAAA12345678",
          "fields": [
            {
              "name": "person0",
              "value": "Arash"
            },
            {
              "name": "person1",
              "value": "Drew"
            }
          ]
        }
      ]
    },
    {
      "id": "id:LbvtH3Oi_JAAAA87654321",
      "path": "/photos/sample2.jpg",
      "is_deleted": false,
      "property_groups": [
        {
          "template_id": "ptid:CxfoMQJzjBAAAA12345678",
          "fields": [
            {
              "name": "person0",
              "value": "Drew"
            }
          ]
        }
      ]
    }
  ]
}
```

Similar to listing files on a folder, search results can be retrieved from Dropbox JavaScripts SDK via 2 methods (allowing pagination of results):  `filePropertiesPropertiesSearch(query)` which receives the queries as described above and returns a set of results along with a cursor; and     `filePropertiesPropertiesSearchContinue(cursor)` that receives a cursor and returns the next set of results with a newer cursor (if there are even more results to be retrieved).

We will expose both methods with that purpose and they will be used later by the **gallery_controller** to search for properties on files on the **dbxservices.js** file.

**dbxservices.js**

```javascript
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
```

It is now time to test the code …  👨‍🔬 

So far, we have the hooks to create a Template, add properties to a file, and search for properties in files.  To test it, add any two images to the `/photos` folder on your Dropbox and rename them `sample1.jpg` and `sample2.jpg` (or use the ones on the sample images).  Now add the following test script:

**testprops.js**

```javascript
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
```

Then you can run it with the following command:


    node -e 'require("./testprops").testProperties()'

**Note**:  because in the scripts we are running an async function on top level code, you will probably need to terminate the process yourself using Ctl+C.  The script will let you know once it is completed.

After you run it, you will get something like the image below, indicating that setting and searching properties works correctly:


![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1533858914761_Screen+Shot+2018-08-09+at+4.54.50+PM.png)

## Source code

🎯 You can find all the code up to this point [here](https://github.com/dropbox/gallerywithtagstutorial/tree/file-properties)


# 4.  AI magic with Azure Face API 

In order to identify faces on pictures and tag Dropbox files using File Properties API, we will be using the Azure Cognitive Services [Face API](https://azure.microsoft.com/en-us/services/cognitive-services/face), which is capable of identifying human faces plus also telling the person who it belongs to.  To use it, you will need a key from Azure Face API.  You can get a free trial key in the website or also use a key from your Azure account if you have one.

The trial key as well as the Azure free tier for Face API are limited to 30K calls per month and 20 calls per minute.  For a large amount of pictures (say hundreds or thousands) this may not work as it will take too long to tag them, but for this project it should be enough.  In any case, we added some throttling logic to the tagging script to keep the API calls under 20 per minute.  You can easily remove it if you want to.

Take note of the `Location` you use for the service as you will need to keep the same for the API calls.  In this example we chose `West Central US`.

Copy your Face API key in your **.env** file.  It should now look like this:

**.env** 

```javascript
DBX_TOKEN='<dropbox app token>'
AZURE_COGNITIVE_KEY='<azure key>'
```

Additionally,  we will add four elements to the configuration file: the Location for the Azure servers, the route for the Azure Face API and a name and description for the Person Group.

**config.js**

```javascript
module.exports = {
  DROPBOX_PHOTOS_FOLDER:'/photos',
  DROPBOX_LIST_FOLDER_LIMIT: 5,
  AZURE_LOCATION:'westcentralus',
  AZURE_FACE_ROUTE:'api.cognitive.microsoft.com/face/v1.0',
  AZURE_PERSON_GROUP_ID:'dbx-photo-tags',
  AZURE_PERSON_GROUP_DESC:'Dropbox images',
}
```

Before we can use Azure Cognitive Services to tag a bunch of images on Dropbox, we need to train the service with the people we are going to be tagging - meaning, before we ask Azure to tag 500 pictures that may or not have Drew on it, we first tell Azure who Drew is by providing a few pictures where only Drew appears in a large region of the picture.  You will see the pictures used later on the document and they are also part of the sample images provided.

Microsoft uses the concept of **Person Group** which is a collection of Persons each identified with a unique **Person ID,** each Person has a set of **Faces** that identify that person.

So the order of actions to execute will be:


1. Create a Person Group
2. Add a Person to a Group → generates a Person ID
3. Add Faces to a Person → generates a Face ID per each face and adds it to that PersonID
4. Add other people (repeat 2 and 3)
5. Train the model

Once the model has been trained, you can pass any picture to Azure and it will tell you who from your group is on that picture… just like magic! This is the power of AI 🤖 

There are many other things you can do with this API. In fact, you could have it selecting the training images by itself by grouping similar faces, but to scope down a bit this project, we will provide the images for the training ourselves.  Because this is something normally done on the backend, we will simply make a script to train the images.

We will be creating a set of methods that will perform the above functions in a file called **azuresevices.js**  As we will be making calls straight to the Azure http endpoints, we can use the **request-promise** library, which returns directly a Promise after each http call.  This library builds on top of the popular **request** library, so we will need to add them both.

First let us add `request-promise`  and `request` libraries.


    npm install request request-promise --save


## Creating a group and adding people to the group

We will add to the **azureservices.js** two important methods.  One to create a Person Group on Azure and another one to add a person to that group.  Adding a person involves getting a PersonID, adding faces to that person (images where only that person appears) and finally training the model.

To keep a local dictionary of people’s names with Person IDs from Azure, we will use the Redis database using key/value pairs.  A prefix plus the Person ID obtained from Azure will be the key, while the name will be the value.


**azureservices.js**

```javascript
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
```

Now that we have methods to add people to a Person Group, we will use a script to add people to this group.  Let us add two people, Drew and Arash.  We will place some images inside the /photos/training folder under each name and use the function on **dbxservices.js** that helps us getting a temporary link for each file on the folder.

Bellow are the training pictures for this exercise (they are included in the [photos](https://github.com/dropbox/gallerywithtagstutorial/blob/master/photos.zip) sample package).  Notice that the Face API supports JPEG, PNG, GIF (the first frame), and BMP formats and allowed image file size is from 1KB to 6MB.  If you need help resizing images to fit this size, see section 7, *Scaling down images*.


![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1533832044010_Screen+Shot+2018-08-09+at+8.57.34+AM.png)


The script will be the following:

**addpeoplescript.js**

```javascript
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
```

And we can run it with the following command:


    node -e 'require("./addpeoplescript").addPeopletoGroup()'

Your terminal should look like this:

![](https://d2mxuefqeaa7sj.cloudfront.net/s_BD2583728F218B6FE5155D5429C5C779C824DC5A31A5759DDEA4E93A64F38E7F_1537924376937_Screen+Shot+2018-09-25+at+6.08.39+PM.png)

If you find yourself in the need to delete the group and the people on it, you can make http calls using the [API Reference](https://westus.dev.cognitive.microsoft.com/docs/services/563879b61984550e40cbbe8d/operations/563879b61984550f30395236) of the [Face API](https://azure.microsoft.com/en-us/services/cognitive-services/face/). In there, you can use the *Person Group - Delete* method, select your location, enter your Azure key and the name of the group in the config file, and submit an http request.
You will also need to remove the stored values on the Redis database. You can do this with the [Redis cli](https://redis.io/topics/rediscli) with the `keys` and the `del` commands.


## Tagging

Now that we have all the people added to Azure in the group, we can do the fun part, which is tagging a bunch of images.  

Tagging works like this: you pass the URL of a picture to Azure Face API, this will give you back an array of FaceIDs, then you send that array of FaceIDs back to Azure and it tells you which PeopleIDs they correspond to in your group.  Then, we check locally the names of those PersonIDs using the Redis database, and finally, we store those names as properties on the file in Dropbox for later retrieval.

Note that on Azure Face API  you cannot send more than 10 faceIDs to the `/identify` endpoint or it will error out, so we need to add a filter for that.  Additionally, supported formats are JPEG, PNG, GIF (the first frame), and BMP. The allowed image file size is from 1KB to 6MB.  If you need help resizing images to fit this size, see section 7, *Scaling down images*.

Now add the following code to the **azureservices.js** file:

**azureservices.js**

```javascript
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
```

We will also do this on a script, but to avoid tagging again and again the same pictures, we will store the **timestamp** of the last tagging action.  We had previously added a timestamp filter to the `dbxservices.getTemporaryLinksForFolderAsync()` method, which uses ISO format. Every time we run the script, we will only tag images added after the value stored.  Ideally you would use a [webhook](https://www.dropbox.com/developers/reference/webhooks) (which is a way to connect to events triggered by changes on Dropbox folders) to trigger this script, but for simplicity, we will simply run it ourselves.

The script will contain 2 lines that will help throttle the 20 requests per minute limit of the Face API, if you have an upgraded license with an S0 tier, you may want to remove it to make it faster. We will use the [util.promisify(setTimeout)](https://nodejs.org/api/timers.html#timers_settimeout_callback_delay_args) utility that comes with Node 8 and provides a Promised version of setTimeout.

**taggingscript.js**

```javascript
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
```

You can run the above script with the following command:

     node -e 'require("./taggingscript").tag()'

To force tagging all the files use this command:

     node -e 'require("./taggingscript").tag(true)'

It will result into something like this (the waiting is because of the throttling):

![](https://d2mxuefqeaa7sj.cloudfront.net/s_BD2583728F218B6FE5155D5429C5C779C824DC5A31A5759DDEA4E93A64F38E7F_1537936670187_Screen+Shot+2018-09-25+at+9.37.28+PM.png)


## Searching

Search results from File Properties API also comes paginated and we will implement it in a similar way as the gallery results.

When the user clicks on the search button of the gallery, this will make a request to the **/gallery/search** endpoint and the server will route it to the `gallery_search` method in the **gallery_controller.js** file. Using the search query entered by the user, we will get the PersonIds stored on the Redis database (more below) and call the   `dbxservices.searchPropertiesAsync()` method, which returns an array of temporary links and a cursor for the next search iteration.  The cursor is stored and the server replies with an html file containing the links to the images.

When a user reaches the last image loaded on the gallery using the right arrow, this will make a call to **/gallery/search/continue** which will route to `search_continue` method in the **gallery_controller.js.**  This method will get the latest search cursor and call `dbxservices.searchPropertiesFromCursorAsync()` obtaining an array of temporary links and a newer cursor.  The cursor is stored and the array of links is sent as a response.

Let us add the controller methods for the search routes.  Replace the two placeholders created earlier with the code below:

**gallery_controller.js**

```javascript
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
```

And the search part is now complete and ready to be tested.


## Source code

🎯 You can find all the code up to this point [here](https://github.com/dropbox/gallerywithtagstutorial/tree/master)

Let us run the server and try a few searches

    npm start

And navigate to http://localhost:3000/gallery

Let us search for “Drew Houston” … which should give pictures where Drew is tagged (see 7 results in the little carousel)

![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1534484757067_Screen+Shot+2018-08-16+at+10.45.28+PM.png)


Now let us try “Arash Ferdowsi” … which gives us pictures with Arash (6 results)

![](https://d2mxuefqeaa7sj.cloudfront.net/s_249AE6AAE2B07641EC6EAA0EA7D8CBE1BFDF910A3A8E87363A2C116D4C03CA57_1534484839431_Screen+Shot+2018-08-16+at+10.46.59+PM.png)



#  5.  Where to go from here

Here are some ideas on how to take this further…


1. Make this project multi-user:  this involves adding an OAuth flow and sessions as described in the [previous tutorial](https://dropbox.github.io/nodegallerytutorial/).  But it also means, ensuring that the database will not mix up users - for this, you can use a unique Dropbox identifier that you can get via the `usersGetCurrentAccount()` method and use it as a prefix for all the keys on Redis.  To ensure that faces of different Dropbox users don’t get mixed you need to make sure that the Person Group name is unique for each user within Azure (you could use part of the Dropbox identifier as Group name) and store all the faces also with the user prefix.
2. You can also cache some temporary links, as they live for 4 hours, instead of going back to Dropbox all the time for them.
3. Put it in a production server as described in the [previous tutorial](https://dropbox.github.io/nodegallerytutorial/).
4. Write a [webhook](https://www.dropbox.com/developers/reference/webhooks) to get notified of changes on Dropbox and trigger a tagging event. 
5. When searching for a large number of tagged photos, you will find that the page that loads on the browser will hang for a while.  This is because we first create links to send along the webpage (to avoid sending an empty page) and the pagination of the search results in the File Properties API cannot be limited.  So if the search involves a large number of files, it may take a while to find all the results to send along the page. A suggestion would be to return an empty web page, and later load it with results from the search.


# 6. I just want to run the code 🤓 

To make the code run, you still need to create a Dropbox app and get an Azure key and install Redis, but this is the short list of instructions to get the code running.


## Prerequisites 

You need to have NodeJS, Express and Redis.

**Node.JS** can be installed from [Nodejs.org](https://nodejs.org/en/) (get a version equal or above 8.1.1.3)

**Express** can be installed with this command

    npm install express-generator -g

**Redis** can be obtained [here](https://redis.io/download).  Once you unpack it open a terminal, go to the redis folder and run.  

    src/redis-server


## Steps


1 Clone the repo  (this also includes the sample images)

```javascript
git clone https://github.com/dropbox/gallerywithtagstutorial.git
```

2 Install dependencies

```javascript
npm install
```

3 Get a Dropbox access token (Need to create a Dropbox app with Full Dropbox Access scope and get the token from the developer console).  For more details see Section 1.


4 Get a key for the Azure [Face API](https://azure.microsoft.com/en-us/services/cognitive-services/face).  For more details see Section 3.


5 Create a .env file and put bot the Dropbox and the Azure key on it.

.**env**
```javascript
DBX_TOKEN='<dropbox_token>'
AZURE_COGNITIVE_KEY='<azure_token>'
```

6 Uncompress the **photos.zip** file you get along the source code into your Dropbox.  There should be a `/photos` folder at the root of Dropbox and a `/photos/training` with the training images.  It has to be the same Dropbox account that you used to get the OAuth token.


7 Run the script to add and train people.  This will add Drew and Arash to your Azure group

```javascript
node -e 'require("./addpeoplescript").addPeopletoGroup()'
```

8 Run the script to tag the sample photos (you may need to wait a minute because of the 20 requests per minute limit on the Face API on the free tier)

```javascript
node -e 'require("./taggingscript").tag()'
```

9 Start the server

```javascript
    npm start
```

10 Go to http://localhost:3000/gallery and start playing with it.


# 7. Scaling down images

When working with your own images, you may find that they exceed the maximum size that the Face API allows (which is 6MB) for both, training and tagging processes.

In the source code of this project, you will find the file [**scaledownimgscript.js**](https://github.com/dropbox/gallerywithtagstutorial/blob/master/scaledownimgscript.js).  You can run it to scale down all the images in a folder that you specify which are above 6MB (you can change this limit) and will move the original files into a **/highres** folder within the existing folder.

You can run the script with the following command:

    node -e 'require("./scaledownimgscript").run()'

**Note:**  to make it work, you need to have completed at least steps 1-3 and 5 of section 6, *I just want to run the code.*


# 8. License

[Apache 2.0](https://github.com/dropbox/gallerywithtagstutorial/blob/master/LICENSE)

