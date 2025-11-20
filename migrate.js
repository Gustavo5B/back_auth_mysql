import mysql from 'mysql2/promise';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  console.log('🚀 Iniciando migración a Railway...');
  
  let connection;
  
  try {
    // Conectar a Railway
    connection = await mysql.createConnection({
      host: 'maglev.proxy.rlwy.net',
      port: 33750,
      user: 'root',
      password: 'RgStHaOWJiXeNTBminNgfUUjEuvmTaTj',
      database: 'railway',
      multipleStatements: true
    });
    
    console.log('✅ Conectado a Railway MySQL');
    
    // Leer archivo SQL
    const sqlPath = join(__dirname, 'sql3805073.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Archivo SQL cargado, ejecutando...');
    
    // Ejecutar SQL
    await connection.query(sql);
    
    console.log('✅ Base de datos importada correctamente');
    console.log('🎉 ¡Migración completada!');
    
    // Verificar tablas creadas
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\n📋 Tablas creadas:');
    tables.forEach(table => {
      console.log(`   - ${Object.values(table)[0]}`);
    });
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
    console.error(error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

migrate();