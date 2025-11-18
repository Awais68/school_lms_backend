const express = require('express');
const asyncHandler = require('express-async-handler');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require('../models/User');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Attendance = require('../models/Attendance');
const Grade = require('../models/Grade');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// @desc    Chat with the assistant
// @route   POST /api/chatbot/chat
// @access  Private
router.post('/chat', protect, asyncHandler(async (req, res) => {
  const { message, sessionId } = req.body;
  const userId = req.user.id;

  if (!message) {
    return res.status(400).json({
      success: false,
      message: 'Message is required'
    });
  }

  try {
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare context based on user role
    let context = `You are an intelligent school assistant chatbot for ${user.firstName} ${user.lastName} (${user.role}). `;
    
    if (user.role === 'student') {
      const student = await Student.findOne({ user: userId });
      if (student) {
        // Get student-specific information
        const studentFees = await Fee.find({ student: student._id });
        const studentAttendance = await Attendance.find({ 
          student: student._id,
          date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        }).populate('course', 'title');
        
        const studentGrades = await Grade.find({ student: student._id })
          .populate('course', 'title')
          .populate('assignment', 'title');
        
        const enrolledCourses = await Course.find({ 
          _id: { $in: student.enrolledStudents }
        });
        
        context += `
        Student Profile: ${student.firstName} ${student.lastName}, Roll: ${student.rollNumber}, Class: ${student.class.name}, Section: ${student.section.name}
        
        Fees Status: ${studentFees.length} fee records, ${studentFees.filter(f => f.status === 'pending').length} pending
        Recent Attendance: ${studentAttendance.length} records, ${studentAttendance.filter(a => a.status === 'present').length} present days
        Grades: ${studentGrades.length} grades
        Enrolled Courses: ${enrolledCourses.length}
        
        Use this context to answer questions specifically for this student.
        `;
      }
    } else if (user.role === 'parent') {
      // Get student information if parent
      const students = await Student.find({ parent: userId });
      if (students.length > 0) {
        const studentIds = students.map(s => s._id);
        const studentFees = await Fee.find({ student: { $in: studentIds } });
        const studentAttendance = await Attendance.find({ 
          student: { $in: studentIds },
          date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }).populate('student', 'firstName lastName').populate('course', 'title');
        
        context += `
        You are helping a parent track their children's progress.
        Number of students: ${students.length}
        Total Fees: ${studentFees.length} records
        Recent Attendance: ${studentAttendance.length} records
        `;
      }
    }

    // Create prompt with context and user message
    const prompt = `
    ${context}
    
    User Query: "${message}"
    
    Instructions:
    - Respond to queries about student profiles, fee status, attendance, grades, courses, assignments, and schedule
    - If user wants to start a support ticket, acknowledge and suggest appropriate action
    - If user wants to trigger notifications or schedule, acknowledge and suggest appropriate action
    - If query is out of scope, politely redirect to appropriate school authority
    - Maintain friendly, professional tone
    - Provide concise, helpful responses
    - For fee-related queries, provide amounts and status
    - For attendance queries, provide attendance rates and recent records
    - For grade queries, provide current grades and averages
    
    Response:
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Process the response for specific actions
    const processedResponse = await processAIResponse(text, userId, message);

    res.json({
      success: true,
      data: {
        response: processedResponse.response,
        action: processedResponse.action,
        sessionId: sessionId || `session_${userId}_${Date.now()}`
      }
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing chat request',
      error: error.message
    });
  }
}));

// Process AI response for specific actions
async function processAIResponse(response, userId, originalQuery) {
  const result = { response, action: null };

  // Check if user wants to create a support ticket
  const ticketKeywords = ['support ticket', 'raise ticket', 'complaint', 'problem', 'issue', 'help'];
  if (ticketKeywords.some(keyword => originalQuery.toLowerCase().includes(keyword))) {
    result.action = {
      type: 'create_ticket',
      ticketData: {
        title: 'User Request via Chatbot',
        description: originalQuery,
        priority: 'medium',
        reportedBy: userId,
        status: 'open'
      }
    };
  }

  // Check if user wants to trigger notifications
  const notificationKeywords = ['notify', 'send notification', 'inform', 'alert'];
  if (notificationKeywords.some(keyword => originalQuery.toLowerCase().includes(keyword))) {
    result.action = {
      type: 'trigger_notification',
      notificationData: {
        type: 'general',
        message: originalQuery,
        sender: userId,
        recipients: [userId] // For example, just the sender
      }
    };
  }

  // Check if user wants to schedule something
  const scheduleKeywords = ['schedule', 'book', 'appointment', 'meeting', 'plan'];
  if (scheduleKeywords.some(keyword => originalQuery.toLowerCase().includes(keyword))) {
    result.action = {
      type: 'schedule_action',
      scheduleData: {
        description: originalQuery,
        requestedBy: userId
      }
    };
  }

  return result;
}

// @desc    Get chat history (if implemented)
// @route   GET /api/chatbot/history
// @access  Private
router.get('/history', protect, asyncHandler(async (req, res) => {
  // This would typically be implemented with a chat history model
  res.json({
    success: true,
    data: {
      history: [],
      message: 'Chat history feature coming soon'
    }
  });
}));

// @desc    Get quick replies based on user role
// @route   GET /api/chatbot/quick-replies
// @access  Private
router.get('/quick-replies', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  let quickReplies = [
    "What's my fee status?",
    "How is my attendance?",
    "What's my schedule today?",
    "I need help with my grades"
  ];

  if (user.role === 'parent') {
    quickReplies = [
      ...quickReplies,
      "How is my child doing?",
      "When is the next parent-teacher meeting?",
      "How can I pay fees?"
    ];
  } else if (user.role === 'student') {
    quickReplies = [
      ...quickReplies,
      "What assignments are due?",
      "Can I see my report card?",
      "What courses am I enrolled in?"
    ];
  } else if (user.role === 'teacher') {
    quickReplies = [
      "What students are in my class?",
      "How can I mark attendance?",
      "How do I upload course materials?"
    ];
  }

  res.json({
    success: true,
    data: {
      quickReplies: quickReplies.slice(0, 8) // Limit to 8 quick replies
    }
  });
}));

// @desc    Health check for chatbot service
// @route   GET /api/chatbot/health
// @access  Public
router.get('/health', asyncHandler(async (req, res) => {
  // Check if Gemini API key is configured
  const isConfigured = !!process.env.GEMINI_API_KEY;
  
  // Check if we can make a simple API call
  let isWorking = false;
  if (isConfigured) {
    try {
      const testModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-pro" });
      await testModel.generateContent("Hello");
      isWorking = true;
    } catch (error) {
      isWorking = false;
    }
  }

  res.json({
    success: true,
    data: {
      configured: isConfigured,
      working: isWorking,
      timestamp: new Date().toISOString()
    }
  });
}));

module.exports = router;