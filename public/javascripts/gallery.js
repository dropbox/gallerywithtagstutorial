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