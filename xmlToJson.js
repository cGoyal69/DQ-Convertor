const { DOMParser } = require('xmldom');

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
const testCases = [
    // Test Case 1: MongoDB Query with Operators
    `<?xml version="1.0" encoding="UTF-8"?><root type="object"><operation type="string">aggregate</operation><pipeline type="array"><item><op-match mongo-operator="true"><age><op-gt mongo-operator="true" type="number">25</op-gt></age><status><op-in mongo-operator="true" type="array"><item type="string">active</item><item type="string">pending</item></op-in></status></op-match></item><item><op-group mongo-operator="true"><_id type="string">$city</_id><count><op-sum mongo-operator="true" type="number">1</op-sum></count><avgAge><op-avg mongo-operator="true" type="string">$age</op-avg></avgAge></op-group></item></pipeline></root>`,
    // Test Case 2: Complex Nested Arrays
    `<?xml version="1.0" encoding="UTF-8"?><root type="object"><arrayTypes><simpleArray type="array"><item type="number">1</item><item type="number">2</item><item type="number">3</item><item type="number">4</item></simpleArray><stringArray type="array"><item type="string">a</item><item type="string">b</item><item type="string">c</item></stringArray><mixedArray type="array"><item type="number">1</item><item type="string">two</item><item type="boolean">true</item><item type="boolean">false</item><item type="null"></item></mixedArray><objectArray type="array"><item><name type="string">John</name><age type="number">30</age></item><item><name type="string">Jane</name><age type="number">25</age></item></objectArray><nestedArrays type="array"><item type="array"><item type="number">1</item><item type="number">2</item></item><item type="array"><item type="number">3</item><item type="number">4</item></item><item type="array"><item type="string">a</item><item type="string">b</item></item></nestedArrays></arrayTypes></root>`,
    // Test Case 3: Mixed Data Types
    `<root type="object"><numbers><integer type="number">42</integer><float type="number">3.14</float><negative type="number">-17</negative></numbers><booleans><true type="boolean">true</true><false type="boolean">false</false></booleans><nullValue type="null"></nullValue><emptyString type="string"></emptyString><nestedObject><key1 type="string">value1</key1><key2><subkey type="string">subvalue</subkey></key2></nestedObject></root>`
];




    testCases.forEach((testCase, index) => {
        console.log(`=== Test Case ${index + 1} ===`);
    
        const backToJson = xmlToJson(testCase);
        console.log("\nConverted back to JSON:");
        console.log(JSON.stringify(backToJson, null, 2));
    
    });