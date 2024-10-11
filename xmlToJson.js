const { DOMParser } = require('xmldom');

// Function to convert XML back to JSON
function xmlToJson(xmlString) {
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

// Test case
const testXml = `<?xml version="1.0" encoding="UTF-8"?><root type="object"><operation type="string">aggregate</operation><collection type="string">users</collection><pipeline type="array"><item><op-match mongo-operator="true"><name type="string">john</name></op-match></item><item><op-group mongo-operator="true"><_id type="string">$city</_id><count><op-sum mongo-operator="true" type="number">1</op-sum></count></op-group></item></pipeline><options><tags type="array"><item type="string">tag1</item><item type="string">tag2</item></tags><nestedArrays type="array"><item type="array"><item type="string">a</item><item type="string">b</item></item><item type="array"><item type="string">c</item><item type="string">d</item></item></nestedArrays></options></root>`;

// Run test
console.log("XML to JSON Conversion Test\n");
console.log("Original XML:");
console.log(testXml);
console.log("\nConverted JSON:");
console.log(JSON.stringify(xmlToJson(testXml), null, 2));