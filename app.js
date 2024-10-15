const express = require("express");
const app = express();
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
app.use(express.json());
const jwt = require("jsonwebtoken");
let db = null;
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const { open } = require("sqlite");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertDBArrayToResponseObj = (array) => {
  return array.map((eachItem) => {
    return {
      stateId: eachItem.state_id,
      stateName: eachItem.state_name,
      population: eachItem.population,
    };
  });
};

const convertDbObjToResponseObj = (item) => {
  return {
    stateId: item.state_id,
    stateName: item.state_name,
    population: item.population,
  };
};

const convertDbObjToResponseObjDistrict = (item) => {
  return {
    districtId: item.district_id,
    districtName: item.district_name,
    stateId: item.state_id,
    cases: item.cases,
    cured: item.cured,
    active: item.active,
    deaths: item.deaths,
  };
};

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1]; // Extract token after 'Bearer '
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username; // Save username in req object for further use
        next();
      }
    });
  }
};

// Login API
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectQuery);
  if (dbUser === undefined) {
    res.status(401).send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      res.send({ jwtToken });
    } else {
      res.status(400).send("Invalid Password");
    }
  }
});

// Get all states
app.get("/states/", authenticateToken, async (req, res) => {
  const selectStatesQuery = `SELECT * FROM state ORDER BY state_id`;
  const statesArray = await db.all(selectStatesQuery);
  res.send(convertDBArrayToResponseObj(statesArray));
});

// Get a specific state by stateId
app.get("/states/:stateId/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const selectStateByIdQuery = `SELECT * FROM state WHERE state_id = ${stateId}`;
  const state = await db.get(selectStateByIdQuery);
  res.send(convertDbObjToResponseObj(state));
});

// Add a new district
app.post("/districts/", authenticateToken, async (req, res) => {
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const addDistrictQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths})`;
  await db.run(addDistrictQuery);
  res.send("District Successfully Added");
});

// Get a specific district by districtId
app.get("/districts/:districtId/", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId}`;
  const district = await db.get(getDistrictQuery);
  res.send(convertDbObjToResponseObjDistrict(district));
});

// Delete a district
app.delete("/districts/:districtId/", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId}`;
  await db.run(deleteDistrictQuery);
  res.send("District Removed");
});

// Update district details
app.put("/districts/:districtId/", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const updateDistrictQuery = `
    UPDATE district
    SET district_name = '${districtName}', state_id = ${stateId}, cases = ${cases},
    cured = ${cured}, active = ${active}, deaths = ${deaths}
    WHERE district_id = ${districtId}`;
  await db.run(updateDistrictQuery);
  res.send("District Details Updated");
});

// Get statistics of a specific state
app.get("/states/:stateId/stats/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStateStatsQuery = `
    SELECT SUM(cases) AS totalCases, SUM(cured) AS totalCured,
    SUM(active) AS totalActive, SUM(deaths) AS totalDeaths
    FROM district WHERE state_id = ${stateId}`;
  const stats = await db.get(getStateStatsQuery);
  res.send(stats);
});

// Get state name by districtId
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (req, res) => {
    const { districtId } = req.params;
    const getDistrictDetailsQuery = `
    SELECT state.state_name AS stateName
    FROM district INNER JOIN state ON district.state_id = state.state_id
    WHERE district.district_id = ${districtId}`;
    const districtDetails = await db.get(getDistrictDetailsQuery);
    res.send(districtDetails);
  }
);

module.exports = app;
