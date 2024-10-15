const { DOMParser, XMLSerializer } = require('xmldom');

// Convert JSON to XML
function jsonToXml(obj, parentElement) {
  for (const prop in obj) {
    const tagName = prop.replace(/^\$/, '_dollar_');
    const element = parentElement.appendChild(parentElement.ownerDocument.createElement(tagName));

    if (typeof obj[prop] === 'object' && !Array.isArray(obj[prop])) {
      jsonToXml(obj[prop], element);
    } else if (Array.isArray(obj[prop])) {
      for (const item of obj[prop]) {
        jsonToXml(item, element);
      }
    } else {
      const textNode = parentElement.ownerDocument.createTextNode(obj[prop].toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      element.appendChild(textNode);
    }
  }
}

// Main function to convert JSON to XML
function convertJsonToXml(originalJson) {
    const jsonObject = JSON.parse(originalJson);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString('<root></root>', "text/xml");
  jsonToXml(jsonObject, xmlDoc.documentElement);
  return new XMLSerializer().serializeToString(xmlDoc);
}

const a = `{"collection":"products","operation":"aggregate","pipeline":[{"$match":{"avg_price":{"$gt":100}},"$group":{"_id":"$category","avg_price":{"$avg":"$price"}},"$sort":{"avg_price":-1}}],"sort":{"total":-1},"limit":5}`
console.log(convertJsonToXml(a))
// Export the function
module.exports = convertJsonToXml;
