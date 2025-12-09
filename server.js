const express = require('express')
const mysql = require('mysql2')
const cors = require('cors')
const bodyParser = require('body-parser')

const app = express()
const port = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(bodyParser.json())

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
// As credenciais estão hardcoded como fallback para facilitar o deploy rápido.
const dbConfig = {
  host: process.env.DB_HOST || 'sql.freedb.tech',
  user: process.env.DB_USER || 'freedb_juliano',
  password: process.env.DB_PASSWORD || 'Hy&7$WGBPYBp8mc',
  database: process.env.DB_NAME || 'freedb_ecofuel',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}

const pool = mysql.createPool(dbConfig)
const promisePool = pool.promise()

// --- INICIALIZAÇÃO E AUTO-MIGRATION ---
// Cria as tabelas automaticamente se não existirem
const initDB = async () => {
  try {
    console.log('Verificando estrutura do banco de dados...')

    // Tabela Users
    await promisePool.query(`
            CREATE TABLE IF NOT EXISTS \`users\` (
              \`email\` varchar(255) NOT NULL,
              \`name\` varchar(255) NOT NULL,
              \`password\` varchar(255) NOT NULL,
              PRIMARY KEY (\`email\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `)

    // Tabela Vehicles
    await promisePool.query(`
            CREATE TABLE IF NOT EXISTS \`vehicles\` (
              \`id\` varchar(50) NOT NULL,
              \`name\` varchar(100) NOT NULL,
              \`type\` varchar(50) NOT NULL,
              \`fuelType\` varchar(20) NOT NULL,
              \`status\` varchar(20) NOT NULL,
              \`avgConsumption\` float NOT NULL,
              \`consumptionUnit\` varchar(10) NOT NULL,
              \`calculationMode\` varchar(20) NOT NULL,
              \`costCenter\` varchar(100) DEFAULT NULL,
              \`lastRefuel\` varchar(50) DEFAULT NULL,
              \`lastLocation\` varchar(255) DEFAULT NULL,
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `)

    // Tabela Logs
    await promisePool.query(`
            CREATE TABLE IF NOT EXISTS \`logs\` (
              \`id\` varchar(50) NOT NULL,
              \`vehicleId\` varchar(50) NOT NULL,
              \`vehicleName\` varchar(100) NOT NULL,
              \`date\` varchar(50) NOT NULL,
              \`timestamp\` bigint(20) NOT NULL,
              \`fuelType\` varchar(20) NOT NULL,
              \`inputQuantity\` float NOT NULL,
              \`inputType\` varchar(10) NOT NULL,
              \`quantity\` float NOT NULL,
              \`unit\` varchar(10) NOT NULL,
              \`pricePerUnit\` float NOT NULL,
              \`totalCost\` float NOT NULL,
              \`odometer\` float DEFAULT NULL,
              \`hourmeter\` float DEFAULT NULL,
              \`location\` varchar(255) DEFAULT NULL,
              \`costCenter\` varchar(100) DEFAULT NULL,
              \`efficiency\` float DEFAULT NULL,
              PRIMARY KEY (\`id\`),
              KEY \`vehicleId\` (\`vehicleId\`),
              CONSTRAINT \`fk_vehicle_log\` FOREIGN KEY (\`vehicleId\`) REFERENCES \`vehicles\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `)

    // Cria usuário admin padrão se não existir
    const [users] = await promisePool.query(
      'SELECT * FROM users WHERE email = ?',
      ['admin@hotmail.com']
    )
    if (users.length === 0) {
      await promisePool.query(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        ['Administrador', 'admin@hotmail.com', 'admin']
      )
      console.log('Usuário admin criado.')
    }

    console.log('Banco de dados inicializado com sucesso!')
  } catch (err) {
    console.error('Erro ao inicializar banco de dados:', err)
  }
}

// Executa a inicialização
initDB()

// --- ROTAS DA API ---

// 1. Health Check (Para o Render saber que o app está vivo)
app.get('/', (req, res) => {
  res.send('EcoFuel Backend is running!')
})

// 2. Auth (Login)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  try {
    const [rows] = await promisePool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    )
    if (rows.length > 0) {
      const user = rows[0]
      if (user.password === password) {
        res.json({
          success: true,
          user: { name: user.name, email: user.email }
        })
      } else {
        res.status(401).json({ success: false, message: 'Senha incorreta' })
      }
    } else {
      res
        .status(404)
        .json({ success: false, message: 'Usuário não encontrado' })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// 3. Register
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body
  try {
    const [existing] = await promisePool.query(
      'SELECT email FROM users WHERE email = ?',
      [email]
    )
    if (existing.length > 0) {
      return res.json({ success: false, message: 'E-mail já cadastrado' })
    }
    await promisePool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, password]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// 4. Vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
    const [rows] = await promisePool.query('SELECT * FROM vehicles')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/vehicles', async (req, res) => {
  const v = req.body
  try {
    const query = `
      INSERT INTO vehicles (id, name, type, fuelType, status, avgConsumption, consumptionUnit, calculationMode, costCenter, lastRefuel, lastLocation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const values = [
      v.id,
      v.name,
      v.type,
      v.fuelType,
      v.status,
      v.avgConsumption,
      v.consumptionUnit,
      v.calculationMode,
      v.costCenter,
      v.lastRefuel,
      v.lastLocationText
    ]
    await promisePool.query(query, values)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    await promisePool.query('DELETE FROM vehicles WHERE id = ?', [
      req.params.id
    ])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 5. Logs
app.get('/api/logs', async (req, res) => {
  try {
    const [rows] = await promisePool.query(
      'SELECT * FROM logs ORDER BY timestamp DESC'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/logs', async (req, res) => {
  const l = req.body
  try {
    const query = `
      INSERT INTO logs (id, vehicleId, vehicleName, date, timestamp, fuelType, inputQuantity, inputType, quantity, unit, pricePerUnit, totalCost, odometer, hourmeter, location, costCenter, efficiency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const values = [
      l.id,
      l.vehicleId,
      l.vehicleName,
      l.date,
      l.timestamp,
      l.fuelType,
      l.inputQuantity,
      l.inputType,
      l.quantity,
      l.unit,
      l.pricePerUnit,
      l.totalCost,
      l.odometer,
      l.hourmeter,
      l.location,
      l.costCenter,
      l.efficiency
    ]
    await promisePool.query(query, values)

    // Atualiza status do veículo
    const updateVehicle = `
      UPDATE vehicles SET lastRefuel = ?, lastLocation = ? WHERE id = ?
    `
    await promisePool.query(updateVehicle, [l.date, l.location, l.vehicleId])

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
