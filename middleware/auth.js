const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      code: "TOKEN_MISSING",
      message: "No token, authorization denied",
    });
  }

  const token = authHeader.split(" ")[1].trim();
  if (!token || token === "undefined" || token === "null") {
    return res.status(401).json({
      success: false,
      code: "TOKEN_MISSING",
      message: "Token is missing or malformed",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Token expired, please login again",
      });
    }

    return res.status(401).json({
      success: false,
      code: "TOKEN_INVALID",
      message: "Token is not valid",
    });
  }
};
