//const { DOMParser, XMLSerializer } = require('xmldom');

function jsonToXml(oJson) {
    function jsonToXml(obj, parentElement) {
        for (const prop in obj) {
            let tagName = prop;

            // Ensure valid XML tag names (replace invalid characters and add a prefix for names that are not valid)
            if (!/^[a-zA-Z_][\w\.\-]*$/.test(tagName)) {
                tagName = `_invalid_${tagName.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`;
            }

            const element = parentElement.appendChild(parentElement.ownerDocument.createElement(tagName));

            if (typeof obj[prop] === 'object' && !Array.isArray(obj[prop])) {
                jsonToXml(obj[prop], element);
            } else if (Array.isArray(obj[prop])) {
                for (const item of obj[prop]) {
                    jsonToXml(item, element);
                }
            } else {
                const textNode = parentElement.ownerDocument.createTextNode(
                    obj[prop].toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                );
                element.appendChild(textNode);
            }
        }
    }
    
    const originalJson = JSON.stringify(oJson);
    const jsonObject = JSON.parse(originalJson);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString('<root></root>', "text/xml");
    jsonToXml(jsonObject, xmlDoc.documentElement);
    return new XMLSerializer().serializeToString(xmlDoc);
}

const a =  {
    "operation": "updateMany",
    "collection": "users",
    "update": {
      "$set": {
        "age": 31,
        "a": "b"
      }
    },
    "filter": {
      "$and": [
        {
          "name": {
            "$eq": "John Doe"
          }
        },
        {
          "name": {
            "$in": [
              "Kavyaa",
              "Lakshita",
              "'Cou"
            ]
          }
        }
      ]
    }
  }

console.log(jsonToXml(a));

// Export the function
//export default jsonToXml;
