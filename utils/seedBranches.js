const mongoose = require("mongoose");
const Branch = require("../models/Branch");
const dotenv = require("dotenv");

dotenv.config();

const seedBranches = async () => {
  try {
    // Check if any branches exist
    const branchCount = await Branch.countDocuments();

    if (branchCount === 0) {
      console.log("No branches found. Creating default branch...");

      const defaultBranch = await Branch.create({
        name: "Main Campus",
        address: {
          street: "123 Education Street",
          city: "City Center",
          state: "State",
          zipCode: "12345",
          country: "Country",
        },
        phone: "+1234567890",
        email: "main@school.edu",
        establishedDate: new Date("2020-01-01"),
        isActive: true,
      });

      console.log("✅ Default branch created:", defaultBranch.name);
      return defaultBranch;
    } else {
      console.log(`✅ ${branchCount} branch(es) already exist. Skipping seed.`);
      return null;
    }
  } catch (error) {
    console.error("❌ Error seeding branches:", error);
    throw error;
  }
};

module.exports = seedBranches;
