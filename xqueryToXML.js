// File: xqueryToXml.js

function xqueryToXml(xquery) {
  const lines = xquery.split('\n').filter(line => line.trim().startsWith('let $'));
  const variables = {};

  lines.forEach(line => {
    const match = line.match(/let \$(\w+) := element (\w+) { (.*) }/);
    if (match) {
      const [_, varName, elementName, content] = match;
      variables[varName] = { elementName, content };
    }
  });

  function buildXml(varName) {
    const { elementName, content } = variables[varName];
    let xml = `<${elementName}`;
    
    // Handle attributes
    const attrMatches = content.match(/attribute (\w+) { "([^"]*)" }/g) || [];
    attrMatches.forEach(attrMatch => {
      const [_, name, value] = attrMatch.match(/attribute (\w+) { "([^"]*)" }/);
      xml += ` ${name}="${value}"`;
    });

    xml += '>';

    // Handle child elements and text content
    const childContent = content.replace(/attribute \w+ { "[^"]*" },?\s*/g, '').trim();
    if (childContent.startsWith('"') && childContent.endsWith('"')) {
      xml += childContent.slice(1, -1); // Remove quotes for text content
    } else {
      const childVarMatches = childContent.match(/\$\w+/g) || [];
      childVarMatches.forEach(childVar => {
        xml += buildXml(childVar.slice(1)); // Remove $ from variable name
      });
    }

    xml += `</${elementName}>`;
    return xml;
  }

  return buildXml('root');
}
module.exports = xqueryToXml;

/*

const originalXml = `
xquery version "3.1";
    let $root := element root { attribute type { "object" }, $root_numbers, $root_booleans, $root_nullValue, $root_emptyString, $root_nestedObject }
let $root_numbers := element numbers { $root_numbers_integer, $root_numbers_float, $root_numbers_negative }
let $root_numbers_integer := element integer { attribute type { "number" }, "42" }
let $root_numbers_float := element float { attribute type { "number" }, "3.14" }
let $root_numbers_negative := element negative { attribute type { "number" }, "-17" }
let $root_booleans := element booleans { $root_booleans_true, $root_booleans_false }
let $root_booleans_true := element true { attribute type { "boolean" }, "true" }
let $root_booleans_false := element false { attribute type { "boolean" }, "false" }
let $root_nullValue := element nullValue { attribute type { "null" } }
let $root_emptyString := element emptyString { attribute type { "string" } }
let $root_nestedObject := element nestedObject { $root_nestedObject_key1, $root_nestedObject_key2 }
let $root_nestedObject_key1 := element key1 { attribute type { "string" }, "value1" }
let $root_nestedObject_key2 := element key2 { $root_nestedObject_key2_subkey }
let $root_nestedObject_key2_subkey := element subkey { attribute type { "string" }, "subvalue" }

    return $root
`;

console.log("Original XML:");
console.log(originalXml);

console.log(xqueryToXml(originalXml));
*/