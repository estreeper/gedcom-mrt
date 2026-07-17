import bcrypt from 'bcryptjs';

// Password hashing. bcryptjs is pure-JS (no native build) which keeps the
// container simple; cost 10 is a reasonable default.

const COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
