const faiss = require('faiss-node');
const dim = 3;
const index = new faiss.IndexFlatL2(dim);
index.add([1, 0, 0,  0, 1, 0,  0, 0, 1]);
const res = index.search([1, 0.1, 0], 2);
console.log(res);
