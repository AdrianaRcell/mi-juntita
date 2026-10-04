import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.MI_JUNTITA_DATABASE_URL);

export default sql;
