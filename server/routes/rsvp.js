const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Event = require('../models/Event');
const mongoose = require('mongoose');

// @route   POST /api/rsvp/:eventId
// @desc    RSVP to an event
// @access  Private
router.post('/:eventId', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    // Find event with session for transaction
    const event = await Event.findById(eventId).session(session);
    
    if (!event) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if event is in the past
    if (new Date(event.date) < new Date()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Cannot RSVP to past events' });
    }

    // Check if RSVP is open (respect time - 1 minute after creation)
    const rsvpOpenAt = event.rsvpOpenAt || new Date(event.createdAt.getTime() + 60 * 1000);
    if (new Date() < rsvpOpenAt) {
      const waitTime = Math.ceil((rsvpOpenAt - new Date()) / 1000);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: `RSVP will open in ${waitTime} seconds. Please wait at least 1 minute after event creation.` 
      });
    }

    // Check if user already RSVP'd
    if (event.attendees.some(attendee => attendee.toString() === userId.toString())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'You have already RSVP\'d to this event' });
    }

    // Check capacity with atomic operation
    if (event.attendees.length >= event.capacity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Event is at full capacity' });
    }

    // Atomic update: Add user to attendees array only if capacity allows
    // This prevents race conditions by using MongoDB's atomic operations
    const updateResult = await Event.updateOne(
      { 
        _id: eventId,
        attendees: { $ne: userId }, // User not already in attendees
        $expr: { $lt: [{ $size: '$attendees' }, '$capacity'] } // Capacity check
      },
      { 
        $addToSet: { attendees: userId } // $addToSet prevents duplicates
      }
    ).session(session);

    if (updateResult.matchedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: 'Could not RSVP. Event may be at capacity or you may have already RSVP\'d.' 
      });
    }

    await session.commitTransaction();
    session.endSession();

    // Fetch updated event
    const updatedEvent = await Event.findById(eventId)
      .populate('creator', 'name email')
      .populate('attendees', 'name email');

    res.json({ 
      message: 'Successfully RSVP\'d to event',
      event: updatedEvent
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('RSVP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/rsvp/:eventId
// @desc    Cancel RSVP to an event
// @access  Private
router.delete('/:eventId', auth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user has RSVP'd
    if (!event.attendees.some(attendee => attendee.toString() === userId.toString())) {
      return res.status(400).json({ message: 'You have not RSVP\'d to this event' });
    }

    // Remove user from attendees
    event.attendees = event.attendees.filter(
      attendee => attendee.toString() !== userId.toString()
    );
    await event.save();

    const updatedEvent = await Event.findById(eventId)
      .populate('creator', 'name email')
      .populate('attendees', 'name email');

    res.json({ 
      message: 'Successfully cancelled RSVP',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Cancel RSVP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/rsvp/user
// @desc    Get all events user has RSVP'd to
// @access  Private
router.get('/user', auth, async (req, res) => {
  try {
    const events = await Event.find({ 
      attendees: req.user._id,
      date: { $gte: new Date() }
    })
      .populate('creator', 'name email')
      .populate('attendees', 'name email')
      .sort({ date: 1 });

    res.json(events);
  } catch (error) {
    console.error('Get user RSVPs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/rsvp/user/created
// @desc    Get all events created by user
// @access  Private
router.get('/user/created', auth, async (req, res) => {
  try {
    const events = await Event.find({ creator: req.user._id })
      .populate('creator', 'name email')
      .populate('attendees', 'name email')
      .sort({ date: 1 });

    res.json(events);
  } catch (error) {
    console.error('Get user created events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

