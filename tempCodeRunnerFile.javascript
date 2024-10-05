function mongoQueryToXML(query, rootElement = 'query') {
  // Helper function to convert key-value pairs to XML
  function objectToXML(obj) {
    let xml = '';

    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];

        if (typeof value === 'object' && !Array.isArray(value)) {
          // Nested object - recursive call
          xml += `<${key}>${objectToXML(value)}</${key}>`;
        } else if (Array.isArray(value)) {
          // Array handling
          xml += `<${key}>`;
          value.forEach(item => {
            xml += `<item>${typeof item === 'object' ? objectToXML(item) : item}</item>`;
          });
          xml += `</${key}>`;
        } else {
          // Simple key-value pair
          xml += `<${key}>${value}</${key}>`;
        }
      }
    }

    return xml;
  }

  // Convert the root element with the query data
  return `<${rootElement}>${objectToXML(query)}</${rootElement}>`;
}

// Example MongoDB query directly in JavaScript object format
const mongoQuery = {
  collection: 'users',
  operation: 'find',
  query: { name: 1, age: 1 },
  sort: { age: -1 }
};

// Convert the MongoDB query to XML
const xmlOutput = mongoQueryToXML(mongoQuery);
console.log(xmlOutput);