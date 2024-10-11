// Function to escape XML special characters
function escapeXml(unsafe) {
    if (unsafe === undefined || unsafe === null) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Function to convert JSON to XML
function jsonToXml(json) {
    function convertToXml(obj, parentKey) {
        if (obj === undefined) return '';
        
        let xml = '';

        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (Array.isArray(item)) {
                    xml += `<item type="array">${convertToXml(item, 'item')}</item>`;
                } else if (typeof item === 'object' && item !== null) {
                    xml += `<item>${convertToXml(item, 'item')}</item>`;
                } else {
                    const type = item === null ? 'null' : typeof item;
                    xml += `<item type="${type}">${escapeXml(item)}</item>`;
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (let [key, value] of Object.entries(obj)) {
                const isMongoOperator = key.startsWith('$');
                const xmlKey = isMongoOperator ? `op-${key.substring(1)}` : key;

                if (typeof value === 'object' && value !== null) {
                    const attributes = [];
                    if (isMongoOperator) attributes.push('mongo-operator="true"');
                    if (Array.isArray(value)) attributes.push('type="array"');
                    
                    const attributeString = attributes.length ? ' ' + attributes.join(' ') : '';
                    xml += `<${xmlKey}${attributeString}>`;
                    xml += convertToXml(value, xmlKey);
                    xml += `</${xmlKey}>`;
                } else {
                    const attributes = [];
                    if (isMongoOperator) attributes.push('mongo-operator="true"');
                    
                    const type = value === null ? 'null' : typeof value;
                    attributes.push(`type="${type}"`);

                    const attributeString = attributes.length ? ' ' + attributes.join(' ') : '';
                    xml += `<${xmlKey}${attributeString}>${escapeXml(value)}</${xmlKey}>`;
                }
            }
        } else {
            const type = obj === null ? 'null' : typeof obj;
            xml = escapeXml(obj);
        }

        return xml;
    }

    return `<?xml version="1.0" encoding="UTF-8"?><root type="object">${convertToXml(json, 'root')}</root>`;
}

// Test case
const testJson = {
    "operation": "aggregate",
    "collection": "users",
    "pipeline": [
        {
            "$match": {
                "name": "john"
            }
        },
        {
            "$group": {
                "_id": "$city",
                "count": {
                    "$sum": 1
                }
            }
        }
    ],
    "options": {
        "tags": ["tag1", "tag2"],
        "nestedArrays": [
            ["a", "b"],
            ["c", "d"]
        ]
    }
};

// Run test
console.log("JSON to XML Conversion Test\n");
console.log("Original JSON:");
console.log(JSON.stringify(testJson, null, 2));
console.log("\nGenerated XML:");
console.log(jsonToXml(testJson));