// convertJsonToXml.js
const { DOMParser, XMLSerializer } = require('xmldom');

function convertJsonToXml(originalJson) {
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


const a =  `{"collection":"users","operation":"find","filter":{"user":{"$eq":"b"}},"projection":{"user":1}}`
console.log(convertJsonToXml(a))

// Export the function
module.exports = convertJsonToXml;
