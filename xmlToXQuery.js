// File: xmlToXquery.js
const { DOMParser } = require('xmldom');

function xmlToXQuery(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  const root = doc.documentElement;

  function processNode(node, parentVar = '') {
    let xquery = '';
    if (node.nodeType === 1) { // Element node
      const nodeName = node.nodeName;
      const varName = parentVar ? `${parentVar}_${nodeName}` : nodeName;
      
      // Handle attributes
      const attrs = Array.from(node.attributes || []).map(attr => 
        `attribute ${attr.name} { "${attr.value}" }`
      ).join(', ');

      // Handle child nodes
      let childContent = '';
      const childNodes = Array.from(node.childNodes || []);
      const textContent = childNodes.filter(child => child.nodeType === 3).map(child => child.nodeValue.trim()).join('');

      if (textContent) {
        childContent = `"${textContent}"`;
      } else {
        const childVars = [];
        for (let child of childNodes) {
          if (child.nodeType === 1) { // Element node
            const childVarName = `${varName}_${child.nodeName}`;
            childVars.push(`$${childVarName}`);
            xquery += processNode(child, varName);
          }
        }
        childContent = childVars.join(', ');
      }

      xquery = `let $${varName} := element ${nodeName} { ${attrs}${attrs && childContent ? ', ' : ''}${childContent} }\n` + xquery;
    }
    return xquery;
  }

  const xquery = `
    xquery version "3.1";
    ${processNode(root)}
    return $root
  `;

  return xquery.trim();
}
module.exports = xmlToXQuery;



const originalXml = `
<root>
  <collection>products</collection>
  <operation>aggregate</operation>
  <pipeline>
    <_dollar_match>
      <avg_price>
        <_dollar_gt>100</_dollar_gt>
      </avg_price>
    </_dollar_match>
    <_dollar_group>
      <_id>$category</_id>
      <avg_price>
        <_dollar_avg>$price</_dollar_avg>
      </avg_price>
    </_dollar_group>
    <_dollar_sort>
      <avg_price>-1</avg_price>
    </_dollar_sort>
  </pipeline>
  <sort>
    <total>-1</total>
  </sort>
  <limit>5</limit>
</root>
`;


console.log("Original XML:");
console.log(originalXml);

console.log(xmlToXQuery(originalXml));
