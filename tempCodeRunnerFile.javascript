const  convertJsonToXml  = require('./6');
const  convertXmlToJson  = require('./7');

// Sample JSON
const originalJson = {
  "collection": "products",
  "operation": "aggregate",
  "pipeline": [
    { "$match": { "avg_price": { "$gt": 100 } } },
    { "$group": { "_id": "$category", "avg_price": { "$avg": "$price" } } },
    { "$sort": { "avg_price": -1 } }
  ],
  "sort": { "total": -1 },
  "limit": 5
};

// Convert JSON to XML
console.log("Original JSON:");
console.log(JSON.stringify(originalJson, null, 2));

const xml = convertJsonToXml(originalJson);
console.log("\nConverted to XML:");
console.log(xml);

// Convert XML back to JSON
const convertedJson = convertXmlToJson(xml);
console.log("\nConverted back to JSON:");
console.log(JSON.stringify(convertedJson, null, 2));

// Compare the two JSON objects
const isMatch = JSON.stringify(originalJson) === JSON.stringify(convertedJson);
console.log(`\nDo the original and converted JSON match? ${isMatch}`);
