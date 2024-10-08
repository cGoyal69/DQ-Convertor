const { DOMParser } = require('xmldom');

// Function to escape XML special characters
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Function to convert JSON to XML with proper indentation
function jsonToXml(json) {
    let indentLevel = 0;
    const indent = '  '; // Two spaces for each level of indentation

    function getIndentation(level) {
        return indent.repeat(level);
    }

    // Recursive function to convert JSON object to XML
    function convertToXml(obj, parentKey) {
        let xml = '';
        
        // Handle different types
        if (Array.isArray(obj)) {
            // Array handling
            xml += `${getIndentation(indentLevel)}<${parentKey} type="array">\n`;
            indentLevel++;
            for (const item of obj) {
                xml += `${getIndentation(indentLevel)}<item>\n`;
                indentLevel++;
                xml += convertToXml(item, 'item');
                indentLevel--;
                xml += `${getIndentation(indentLevel)}</item>\n`;
            }
            indentLevel--;
            xml += `${getIndentation(indentLevel)}</${parentKey}>\n`;
        } else if (typeof obj === 'object' && obj !== null) {
            // Object handling
            for (const [key, value] of Object.entries(obj)) {
                const escapedKey = escapeXml(key.replace(/^\$/, '')); // Remove $ sign from key
                
                if (typeof value === 'object' && value !== null) {
                    if (parentKey === 'root') {
                        // Top-level elements
                        xml += `${getIndentation(indentLevel)}<${escapedKey}>\n`;
                        indentLevel++;
                        xml += convertToXml(value, escapedKey);
                        indentLevel--;
                        xml += `${getIndentation(indentLevel)}</${escapedKey}>\n`;
                    } else {
                        // Nested elements
                        xml += `${getIndentation(indentLevel)}<${escapedKey}>\n`;
                        indentLevel++;
                        xml += convertToXml(value, escapedKey);
                        indentLevel--;
                        xml += `${getIndentation(indentLevel)}</${escapedKey}>\n`;
                    }
                } else {
                    // Simple key-value pairs
                    xml += `${getIndentation(indentLevel)}<${escapedKey}>${escapeXml(String(value))}</${escapedKey}>\n`;
                }
            }
        } else {
            // Primitive value handling
            return `${getIndentation(indentLevel)}${escapeXml(String(obj))}\n`;
        }
        
        return xml;
    }

    // Start converting with the top-level element name
    return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${convertToXml(json, 'root')}</root>`;
}

// Test cases
const testCases = [
    {
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
    },
    {
        "simpleArray": [1, 2, 3, 4],
        "mixedArray": [1, "two", {"three": 3}, [4, 5]],
        "emptyArray": [],
        "arrayOfArrays": [[1, 2], [3, 4]]
    }
];

// Test and output
testCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}:`);
    console.log('Original JSON:', JSON.stringify(testCase, null, 2));
    
    const xml = jsonToXml(testCase);
    console.log('XML Output:\n', xml);
    console.log('---');
});