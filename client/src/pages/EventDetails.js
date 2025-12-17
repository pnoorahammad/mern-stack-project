import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import { getImageUrl } from '../utils/constants';
import { FiCalendar, FiMapPin, FiUsers, FiEdit, FiTrash2, FiUser } from 'react-icons/fi';
import './EventDetails.css';

const EventDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchEvent();
  }, [id]);

  const fetchEvent = async () => {
    try {
      const response = await api.get(`/events/${id}`);
      setEvent(response.data);
    } catch (error) {
      console.error('Error fetching event:', error);
      setMessage('Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setRsvpLoading(true);
    setMessage('');

    try {
      await api.post(`/rsvp/${id}`);
      setMessage('Successfully joined the event!');
      fetchEvent();
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Failed to join. Please try again.';
      setMessage(errorMsg);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCancelRSVP = async () => {
    setRsvpLoading(true);
    setMessage('');

    try {
      await api.delete(`/rsvp/${id}`);
      setMessage('Successfully disconnected from the event');
      fetchEvent();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to disconnect. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this event?')) {
      return;
    }

    try {
      await api.delete(`/events/${id}`);
      navigate('/dashboard');
    } catch (error) {
      alert('Failed to delete event');
      console.error('Error deleting event:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="loading">Loading event...</div>;
  }

  if (!event) {
    return <div className="no-event">Event not found</div>;
  }

  const isCreator = user && event.creator._id === user.id;
  const hasRSVPd = user && event.attendees.some(attendee => attendee._id === user.id);
  const isFull = event.attendees.length >= event.capacity;
  const isPast = new Date(event.date) < new Date();
  
  // Check if RSVP is open (1 minute after creation - respect time)
  const rsvpOpenAt = event.rsvpOpenAt 
    ? new Date(event.rsvpOpenAt) 
    : new Date(new Date(event.createdAt || Date.now()).getTime() + 60 * 1000);
  const canRSVP = new Date() >= rsvpOpenAt;
  const waitTime = canRSVP ? 0 : Math.ceil((rsvpOpenAt.getTime() - new Date().getTime()) / 1000);

  return (
    <div className="event-details">
      <div className="container">
        <div className="event-details-content">
          <div className="event-main card">
            {event.image && (
              <img 
                src={getImageUrl(event.image)} 
                alt={event.title}
                className="event-image"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
            <div className="event-body">
              <h1>{event.title}</h1>
              <div className="event-meta">
                <span>
                  <FiCalendar /> {formatDate(event.date)}
                </span>
                <span>
                  <FiMapPin /> {event.location}
                </span>
                <span>
                  <FiUsers /> {event.attendees.length} / {event.capacity} attendees
                </span>
              </div>
              <div className="event-description">
                <h3>Description</h3>
                <p>{event.description}</p>
              </div>
              <div className="event-creator">
                <p><strong>Created by:</strong> {event.creator.name}</p>
              </div>
              {message && (
                <div className={`alert ${message.includes('Successfully') ? 'alert-success' : 'alert-error'}`}>
                  {message}
                </div>
              )}
              <div className="event-actions">
                {isCreator ? (
                  <>
                    <Link to={`/events/${id}/edit`} className="btn btn-secondary">
                      <FiEdit /> Edit Event
                    </Link>
                    <button onClick={handleDelete} className="btn btn-danger">
                      <FiTrash2 /> Delete Event
                    </button>
                  </>
                ) : (
                  <>
                    {!isPast && (
                      <>
                        {hasRSVPd ? (
                          <button
                            onClick={handleCancelRSVP}
                            className="btn btn-danger"
                            disabled={rsvpLoading}
                          >
                            {rsvpLoading ? 'Disconnecting...' : 'Disconnect from Event'}
                          </button>
                        ) : (
                          <>
                            {canRSVP ? (
                              <button
                                onClick={handleRSVP}
                                className="btn btn-primary"
                                disabled={rsvpLoading || isFull}
                              >
                                {rsvpLoading ? 'Joining...' : isFull ? 'Event Full' : 'Join Event'}
                              </button>
                            ) : (
                              <div>
                                <button
                                  className="btn btn-secondary"
                                  disabled={true}
                                >
                                  RSVP Opens in {waitTime}s
                                </button>
                                <p style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>
                                  Please wait at least 1 minute after event creation
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                    {isPast && <p className="past-event">This event has passed</p>}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="event-sidebar">
            <div className="attendees-card card">
              <h3>Attendees ({event.attendees.length})</h3>
              {event.attendees.length === 0 ? (
                <p className="no-attendees">No attendees yet</p>
              ) : (
                <div className="attendees-list">
                  {event.attendees.map((attendee) => (
                    <div key={attendee._id} className="attendee-item">
                      <FiUser /> {attendee.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetails;

