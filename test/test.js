var test = require("tape"),
  	tpl = require("../"),
	fs = require("fs");
	
test("test render call.", function (t) {
  var str = tpl.render("${{name}}", {name: "steve"});
  t.equal(str, "steve");
  t.end();
});

test("test compile call.", function (t) {
  var c = tpl.compile("${{name}}");

  var d = c({name: "steve"});

  t.equal(d, "steve");
  t.end();
});

test("test filters/modifiers.", function (t) {
  tpl.filters.toYesNo = function (val) {
    return val
      ? "yes"
      : "no";
  };

  var str1 = tpl.render("${{good|toYesNo}}", {good: true});
  var str2 = tpl.render("${{good|toYesNo}}", {good: false});

  t.equal(str1, "yes");
  t.equal(str2, "no");
  t.end();
});

test("test include files.", function (t) {
  var str1 = tpl.render("before {{include ./test/test-include1.html}} after", {name: "steve"});
  t.equal(str1, "before steve after");
  t.end();
});

test("test double curly braces with pound signs.", function (t) {
  var data = {
    age: 21
    , name: "Jacob"
    , names: ["Joesph", "Jacob", "Dan", "D"]
  }
  var html = '{{#if age == 35}}You are ${{age}} years old.{{/if}}{{#if age == 21}}You are ${{age}} years old.{{/if}}';
  var renderedHtml = tpl.render(html, data);
  var expectedOutput = "You are " +  data.age + " years old.";
  t.equal(renderedHtml, expectedOutput);
  

    fs.readFile("test/test-include4.html", "utf8", function(err, fileData){
    if(err){
      console.log(err);
    }
    if(fileData){
      console.log((tpl.render(fileData, data)));
    }
  });

  t.end();
});

// a = tpl.compile('dlflkjsadf', { opening : '{{#', closing: '}}'})


// tpl.OPENING = '{{#'
// tpl.CLOSING = '}}'