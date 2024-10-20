//import { DOMParser } from ('xmldom');

function xmlToJson(xmlString) {
  function xmlToJson(node) {
    if (node.nodeType === 3) { // text
      return node.nodeValue.trim();
    }

    let obj = {};
    if (node.nodeType === 1) { // element
      for (let j = 0; j < node.attributes.length; j++) {
        const attribute = node.attributes.item(j);
        obj[attribute.nodeName] = attribute.nodeValue;
      }

      if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
        return node.childNodes[0].nodeValue.trim();
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          const item = node.childNodes.item(i);
          const nodeName = item.nodeName.replace(/^_dollar_/, '$');

          // Initialize array if it is a pipeline
          if (nodeName === 'pipeline' && !Array.isArray(obj[nodeName])) {
            obj[nodeName] = [];
          }

          if (item.nodeType === 1) { // element
            const childObj = xmlToJson(item);
            if (Array.isArray(obj[nodeName])) {
              obj[nodeName].push(childObj);
            } else if (typeof obj[nodeName] === "undefined") {
              obj[nodeName] = childObj;
            } else {
              if (!Array.isArray(obj[nodeName])) {
                obj[nodeName] = [obj[nodeName]];
              }
              obj[nodeName].push(childObj);
            }
          }
        }
      }
    }

    // Convert numeric strings back to numbers
    for (const key in obj) {
      if (typeof obj[key] === 'string' && !isNaN(obj[key])) {
        obj[key] = Number(obj[key]);
      }
      if (Array.isArray(obj[key])) {
        obj[key] = obj[key].map(item => {
          return typeof item === 'string' && !isNaN(item) ? Number(item) : item;
        });
      }
    }

    // Remove _text property
    if (typeof obj === 'object' && Object.keys(obj).length === 1 && obj._text) {
      return obj._text;
    }

    return obj;
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  return JSON.stringify(xmlToJson(xmlDoc.documentElement));
}

const xmlInput = `<root><collection>products</collection><operation>aggregate</operation><pipeline><_dollar_match><avg_price><_dollar_gt>100</_dollar_gt></avg_price></_dollar_match><_dollar_group><_id>$category</_id><avg_price><_dollar_avg>$price</_dollar_avg></avg_price></_dollar_group><_dollar_sort><avg_price>-1</avg_price></_dollar_sort></pipeline><sort><total>-1</total></sort><limit>5</limit></root>`;
console.log(xmlToJson(xmlInput));

// Export the function
// module.exports = xmlToJson;
