const { DOMParser, XMLSerializer } = require('xmldom');

// Sample JSON
const originalJ = `{
  "collection": "products",
  "operation": "aggregate",
  "pipeline": [
    { "$match": { "avg_price": { "$gt": 100 } } },
    { "$group": { "_id": "$category", "avg_price": { "$avg": "$price" } } },
    { "$sort": { "avg_price": -1 } }
  ],
  "sort": { "total": -1 },
  "limit": 5
}`;
const originalJson = JSON.parse(originalJ)

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

// Convert XML to JSON
function xmlToJson(node) {
  if (node.nodeType === 3) { // text
    return node.nodeValue.trim();
  }

  let obj = {};
  if (node.nodeType === 1) { // element
    for (let j = 0; j < node.attributes.length; j++) {
      const attribute = node.attributes.item(j);
      obj[attribute.nodeName] = attribute.nodeValue;
    }

    // Check if the element has text content
    if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
      return node.childNodes[0].nodeValue.trim();
    } else {
      let hasChildElements = false;
      for (let i = 0; i < node.childNodes.length; i++) {
        const item = node.childNodes.item(i);
        if (item.nodeType === 1) hasChildElements = true;
        const nodeName = item.nodeName.replace(/^_dollar_/, '$');

        // Initialize array if it is a pipeline
        if (nodeName === 'pipeline' && !Array.isArray(obj[nodeName])) {
          obj[nodeName] = [];
        }

        if (item.nodeType === 1) { // element
          const childObj = xmlToJson(item);
          if (Array.isArray(obj[nodeName])) {
            obj[nodeName].push(childObj);
          } else if (typeof obj[nodeName] === "undefined") {
            obj[nodeName] = childObj;
          } else {
            if (!Array.isArray(obj[nodeName])) {
              obj[nodeName] = [obj[nodeName]];
            }
            obj[nodeName].push(childObj);
          }
        }
      }
    }
  }

  // Convert numeric strings back to numbers
  for (const key in obj) {
    if (typeof obj[key] === 'string' && !isNaN(obj[key])) {
      obj[key] = Number(obj[key]);
    }
    if (Array.isArray(obj[key])) {
      obj[key] = obj[key].map(item => {
        return typeof item === 'string' && !isNaN(item) ? Number(item) : item;
      });
    }
  }

  // Remove _text property
  if (typeof obj === 'object' && Object.keys(obj).length === 1 && obj._text) {
    return obj._text;
  }

  return obj;
}




// Compare two JSON objects
function compareJson(json1, json2) {
  return JSON.stringify(json1) === JSON.stringify(json2);
}


// Main function to perform the conversion and comparison
function convertAndCompare() {
  console.log("Original JSON:");
  console.log(JSON.stringify(originalJson, null, 2));

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString('<root></root>', "text/xml");
  jsonToXml(originalJson, xmlDoc.documentElement);
  const xml = new XMLSerializer().serializeToString(xmlDoc);
  console.log("\nConverted to XML:");
  console.log(xml);

  const convertedJson = xmlToJson(xmlDoc.documentElement);
  console.log("\nConverted back to JSON:");
  console.log(JSON.stringify(convertedJson, null, 2));

  const isMatch = compareJson(originalJson, convertedJson);
  console.log(`\nDo the original and converted JSON match? ${isMatch}`);
}

// Run the conversion and comparison
convertAndCompare();

