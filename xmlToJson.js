const { DOMParser } = require('xmldom');

// Function to convert XML back to JSON
function xmlToJSON(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    function parseNode(node) {
        if (!node) return null;

        if (node.nodeType === 3) {
            const content = node.nodeValue.trim();
            return content === '' ? null : content;
        }

        // Handle arrays
        if (node.getAttribute('type') === 'array') {
            const items = Array.from(node.childNodes).filter(child => child.nodeType === 1);
            return items.map(item => {
                if (item.getAttribute('type') === 'array') {
                    // This is a nested array
                    return parseNode(item);
                }
                return parseNodeValue(item);
            });
        }

        const children = Array.from(node.childNodes).filter(child => child.nodeType === 1);

        if (children.length === 0) {
            return parseNodeValue(node);
        }

        let result = {};
        children.forEach(child => {
            let key = child.tagName;
            
            // Handle MongoDB operators
            if (child.getAttribute('mongo-operator') === 'true') {
                key = `$${key.replace('op-', '')}`;
            }

            result[key] = parseNodeValue(child);
        });

        return result;
    }

    function parseNodeValue(node) {
        const type = node.getAttribute('type');
        
        if (type === 'array') {
            return parseNode(node);
        }

        if (node.childNodes.length > 1 || (node.firstChild && node.firstChild.nodeType === 1)) {
            return parseNode(node);
        }

        const content = node.textContent.trim();

        switch (type) {
            case 'number': return Number(content);
            case 'boolean': return content.toLowerCase() === 'true';
            case 'null': return null;
            default: return content;
        }
    }

    return parseNode(xmlDoc.documentElement);
}
module.exports = xmlToJSON;


// Test case
const testXml = `<?xml version="1.0" encoding="UTF-8"?><root type="object"><collection>products</collection><operation>aggregate</operation><pipeline><$match><avg_price><$gt>100</$gt></avg_price></$match></pipeline><pipeline><$group><_id>$category</_id><avg_price><$avg>$price</$avg></avg_price></$group></pipeline><pipeline><$sort><avg_price>-1</avg_price></$sort></pipeline><sort><total>-1</total></sort><limit>5</limit></root>`;

// Run test
console.log("XML to JSON Conversion Test\n");
console.log("Original XML:");
console.log(testXml);
console.log("\nConverted JSON:");
console.log(JSON.stringify(xmlToJSON(testXml), null, 2));
