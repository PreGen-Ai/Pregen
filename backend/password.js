import bcrypt from "bcryptjs";

const password = "12345678";
const hash = bcrypt.hashSync(password, 10);

console.log(hash);
console.log(bcrypt.compareSync(password, hash)); // true
