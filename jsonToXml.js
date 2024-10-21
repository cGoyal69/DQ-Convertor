//const { DOMParser, XMLSerializer } = require('xmldom');

function convertJsonToXml(originalJson) {
    function jsonToXml(obj, parentElement) {
        for (const prop in obj) {
            const tagName = prop.replace(/^\$/, '_dollar_');

            // Create the XML element
            const element = parentElement.appendChild(parentElement.ownerDocument.createElement(tagName));

            if (typeof obj[prop] === 'object' && !Array.isArray(obj[prop])) {
                // Recursively handle nested objects
                jsonToXml(obj[prop], element);
            } else if (Array.isArray(obj[prop])) {
                // Handle arrays
                for (const item of obj[prop]) {
                    const itemElement = element.appendChild(parentElement.ownerDocument.createElement('item')); // Wrap each item in an <item> tag
                    if (typeof item === 'object') {
                        jsonToXml(item, itemElement);
                    } else {
                        const textNode = parentElement.ownerDocument.createTextNode(
                            item.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        );
                        itemElement.appendChild(textNode);
                    }
                }
            } else {
                // Handle primitive values
                const textNode = parentElement.ownerDocument.createTextNode(
                    obj[prop].toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                );
                element.appendChild(textNode);
            }
        }
    }

    const jsonObject = JSON.parse(originalJson);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString('<root></root>', "text/xml");
    jsonToXml(jsonObject, xmlDoc.documentElement);
    return new XMLSerializer().serializeToString(xmlDoc);
}

const a =  `{
  "operation": "insertOne",
  "collection": "customers",
  "documents": {
    "customer_id": 1,
    "customer_name": "John Doe",
    "email": "johndoe@example.com"
  }
}`;

console.log(convertJsonToXml(a));

// Export the function
// module.exports = convertJsonToXml;
