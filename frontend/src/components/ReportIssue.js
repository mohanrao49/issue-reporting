import React, { useState, useContext, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { LanguageContext } from '../App';
import { ArrowLeft, Camera, Mic, Type, MapPin, Upload } from 'lucide-react';
import apiService from '../services/api';

const ReportIssue = ({ user }) => {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [reportData, setReportData] = useState({
    title: '',
    description: '',
    location: '',
    coordinates: null
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [recordingType, setRecordingType] = useState('text'); // 'photo', 'text'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechRecognitionAvailable, setIsSpeechRecognitionAvailable] = useState(false);
  const recognitionRef = useRef(null);
  const targetRef = useRef('description');
  const lastTranscriptTitleRef = useRef('');
  const lastTranscriptDescRef = useRef('');

  // Check if speech recognition is available on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    setIsSpeechRecognitionAvailable(!!SpeechRecognition && isHTTPS);
  }, []);

  // Translation function using Google Translate free endpoint
  const translateToEnglish = async (text) => {
    if (!text || !text.trim()) return text;
    
    try {
      // First try with auto-detect (works best for most languages including Telugu)
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`
      );
      
      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extract translated text from the response
      if (data && data[0] && Array.isArray(data[0]) && data[0].length > 0) {
        let translatedText = '';
        for (let i = 0; i < data[0].length; i++) {
          if (data[0][i] && data[0][i][0]) {
            translatedText += data[0][i][0];
          }
        }
        translatedText = translatedText.trim();
        
        // Always return the translated text (even if same, as it might already be English)
        if (translatedText) {
          console.log('Translation result:', { original: text, translated: translatedText });
          return translatedText;
        }
      }
      
      // If extraction failed, try alternative parsing
      console.warn('Primary translation parsing failed, trying alternative...');
      if (data && data[0]) {
        const altText = String(data[0]).trim();
        if (altText && altText !== text) {
          console.log('Alternative translation result:', { original: text, translated: altText });
          return altText;
        }
      }
      
      // Fallback: return original text
      console.warn('Translation extraction failed, returning original text:', text);
      return text;
    } catch (error) {
      console.error('Translation error:', error);
      toast.warning('Translation unavailable. Using recognized text as-is.');
      return text;
    }
  };

  const ensureSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Try Chrome.');
      return null;
    }

    // Check if we're on HTTPS (required for speech recognition)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      toast.error('Speech recognition requires HTTPS. Please use a secure connection.');
      return null;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      // Support multiple languages - try Telugu first, fallback to auto-detect
      // Telugu (te-IN) ensures proper recognition of Telugu speech
      recognition.lang = 'te-IN,hi-IN,en-IN'; // Support Telugu, Hindi, English (India)
      recognition.interimResults = false; // only final results to avoid repetition
      recognition.continuous = true;
      recognition.onresult = async (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        transcript = transcript.trim();
        if (!transcript) return;
        
        console.log('Recognized text (before translation):', transcript);
        
        // Translate to English immediately after recognition
        const translatedText = await translateToEnglish(transcript);
        
        console.log('Translated text (after translation):', translatedText);
        
        // Only store and display the English translated text
        if (targetRef.current === 'title') {
          if (translatedText === lastTranscriptTitleRef.current) return;
          lastTranscriptTitleRef.current = translatedText;
          setReportData(prev => ({
            ...prev,
            title: (prev.title ? (prev.title.trim() + ' ') : '') + translatedText
          }));
        } else {
          if (translatedText === lastTranscriptDescRef.current) return;
          lastTranscriptDescRef.current = translatedText;
          setReportData(prev => ({
            ...prev,
            description: (prev.description ? (prev.description.trim() + ' ') : '') + translatedText
          }));
        }
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.onerror = (error) => {
        console.error('Speech recognition error:', error);
        setIsListening(false);
        
        // Handle specific error types
        const errorType = error.error || error.message || '';
        
        if (errorType === 'not-allowed') {
          toast.error('Microphone permission denied. Please allow microphone access in your browser settings.');
        } else if (errorType === 'service-not-allowed') {
          toast.error('Speech recognition service is not available. This may be due to browser settings or network restrictions. Please use text input instead.');
        } else if (errorType === 'no-speech') {
          toast.warning('No speech detected. Please try again.');
        } else if (errorType === 'audio-capture') {
          toast.error('No microphone found. Please connect a microphone and try again.');
        } else if (errorType === 'network') {
          toast.error('Network error. Please check your internet connection and try again.');
        } else if (errorType === 'aborted') {
          // User stopped the recognition, don't show error
          return;
        } else {
          // Generic error message with more context
          const errorMsg = error.message || 'Unknown error';
          toast.error(`Speech recognition unavailable: ${errorMsg}. Please use text input instead.`);
        }
      };
      recognitionRef.current = recognition;
    }
    return recognitionRef.current;
  };

  const toggleListening = () => {
    const recognition = ensureSpeechRecognition();
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      if (targetRef.current === 'title') {
        lastTranscriptTitleRef.current = '';
      } else {
        lastTranscriptDescRef.current = '';
      }
      recognition.start();
      setIsListening(true);
    }
  };


  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      // For demonstration, we'll just store the file name
      // In a real app, you'd upload this to a server
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    // Reset the file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setReportData(prev => ({
        ...prev,
        coordinates: [23.2599, 77.4126],
        location: 'MG Road, Bhopal (Default Location)'
      }));
      return;
    }
    
    toast.info('Requesting your location...');
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setReportData(prev => ({
          ...prev,
          coordinates: [latitude, longitude],
          location: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
        }));
        toast.success('Location obtained successfully');
        navigator.geolocation.clearWatch(watchId);
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMsg = 'Unable to get your location';
        if (error.code === 1) {
          errorMsg = 'Location permission denied. Please allow location access.';
        } else if (error.code === 2) {
          errorMsg = 'Location unavailable. Please check your device settings.';
        } else if (error.code === 3) {
          errorMsg = 'Location request timed out. Please try again.';
        }
        toast.error(errorMsg);
        
        // Fallback: try with less strict options
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              setReportData(prev => ({
                ...prev,
                coordinates: [latitude, longitude],
                location: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
              }));
              toast.success('Location obtained successfully');
            },
            () => {
              // Final fallback
              setReportData(prev => ({
                ...prev,
                coordinates: [23.2599, 77.4126],
                location: 'MG Road, Bhopal (Default Location)'
              }));
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
          );
        }, 1000);
        navigator.geolocation.clearWatch(watchId);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 }
    );
    
    // Clear watch after 20 seconds
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
    }, 20000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    let issueData = null; // Declare issueData in the outer scope

    try {
      // Validate required fields
      if (!reportData.coordinates || !reportData.coordinates[0] || !reportData.coordinates[1]) {
        toast.error('Please get your location first');
        setIsSubmitting(false);
        return;
      }

      // Validate field lengths
      if (reportData.title.length < 5) {
        toast.warning('Title must be at least 5 characters long');
        setIsSubmitting(false);
        return;
      }

      if (reportData.description.length < 10) {
        toast.warning('Description must be at least 10 characters long');
        setIsSubmitting(false);
        return;
      }

      // Debug: Log the data being sent
      console.log('User data:', user);
      
      // 1) Validate with ML backend first (category will be auto-detected)
      // Send image file directly to ML backend (NOT uploaded to Cloudinary yet)
      const mlPayload = {
        report_id: `${Date.now()}`,
        description: reportData.description,
        user_id: user?._id || user?.id || 'anon',
        latitude: reportData.coordinates[0],
        longitude: reportData.coordinates[1]
      };

      // ML validation is now completely non-blocking with 45 second timeout and retries
      // If it times out or fails after retries, we proceed with default category
      let mlResult = null;
      try {
        // 45 second timeout with 2 retries to handle Render cold starts
        // Pass selectedFile directly to ML backend
        mlResult = await apiService.validateReportWithML(mlPayload, selectedFile, 45000, 2);
        console.log('ML validation result:', mlResult);
      } catch (mlError) {
        // This should rarely happen now since validateReportWithML returns null instead of throwing
        console.warn('ML validation error (non-blocking):', mlError.message);
        mlResult = null;
      }
      
      // Only check for explicit rejections from ML backend
      if (mlResult && mlResult.accept === false && mlResult.status === 'rejected') {
        setIsSubmitting(false);
        const reason = mlResult.reason || 'Report rejected by validator';
        toast.error(`Report rejected: ${reason}`);
        return;
      }
      
      // 2) Upload image to Cloudinary ONLY IF ML accepted the report
      let imageUrl = null;
      let uploadedPublicId = null;
      
      if (selectedFile && mlResult && mlResult.accept === true) {
        try {
          const uploadResponse = await apiService.uploadImage(selectedFile);
          // Support both our backend shape { success, data: { url, publicId } }
          // and any direct shape { url, secure_url, public_id }
          const uploaded = uploadResponse?.data || uploadResponse || {};
          imageUrl = uploaded.url || uploaded.secure_url || null;
          uploadedPublicId = uploaded.publicId || uploaded.public_id || null;
        } catch (uploadError) {
          console.warn('Image upload failed, continuing without image:', uploadError);
          // Continue without image if upload fails
        }
      }

      // Prepare issue data (category will be auto-detected by ML backend)
      issueData = {
        title: reportData.title,
        description: reportData.description,
        location: {
          name: reportData.location,
          coordinates: {
            latitude: reportData.coordinates[0],
            longitude: reportData.coordinates[1]
          }
        },
        images: imageUrl ? [{
          url: imageUrl,
          publicId: uploadedPublicId || imageUrl.split('/').pop(),
          caption: 'Issue image'
        }] : []
      };

      // Use ML-detected category if available, otherwise use default
      if (mlResult && mlResult.category) {
        issueData.category = mlResult.category;
        console.log('Using ML-detected category:', mlResult.category);
      } else {
        // Default category if ML validation failed or timed out
        if (!issueData.category) {
          issueData.category = 'Other';
        }
        // Only show warning if ML was attempted but failed (not if it was skipped)
        if (mlResult === null) {
          console.log('ML validation skipped (timeout/unavailable), using default category');
        }
      }

      // Optionally map ML urgency to backend priority if provided
      if (mlResult && mlResult.urgency) {
        issueData.priority = mlResult.urgency;
      }

      // Ensure priority is set if not provided
      if (!issueData.priority) {
        issueData.priority = 'medium'; // Default priority
      }

      // 3) Submit to backend only if accepted
      const response = await apiService.createIssue(issueData);
      
      setIsSubmitting(false);
      toast.success('Issue reported successfully!');
      navigate('/citizen');
    } catch (error) {
      setIsSubmitting(false);
      console.error('Issue creation error:', error);
      console.error('Issue data sent:', issueData);
      toast.error(`Error: ${error.message}`);
    }
  };

  return (
    <div className="form-container">
      <div className="form-card">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <button 
            onClick={() => navigate('/citizen')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#1e4359', 
              cursor: 'pointer',
              marginRight: '1rem'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="form-title">{t('reportIssue')}</h1>
        </div>

        {/* Evidence Capture Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            fontSize: '1.1rem', 
            fontWeight: '600', 
            color: '#1e293b', 
            marginBottom: '1rem' 
          }}>
            Capture Evidence
          </h3>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(1, 1fr)', 
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <button
              type="button"
              className={`btn-secondary ${recordingType === 'photo' ? 'selected' : ''}`}
              onClick={() => setRecordingType('photo')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '1rem',
                background: recordingType === 'photo' ? '#1e4359' : 'transparent',
                color: recordingType === 'photo' ? 'white' : '#1e4359'
              }}
            >
              <Camera size={20} />
              <span>Photo</span>
            </button>

            
          </div>

          {/* File Upload for Photo */}
          {recordingType === 'photo' && (
            <div 
              className={`image-upload ${selectedFile ? 'has-image' : ''}`}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <input
                id="fileInput"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              
              {selectedFile ? (
                <div style={{ position: 'relative' }}>
                  <img 
                    src={URL.createObjectURL(selectedFile)} 
                    alt="Preview"
                    className="uploaded-image"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <p className="upload-text">Click to change image</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage();
                      }}
                      style={{
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <Camera className="upload-icon" />
                  <p className="upload-text">Click to take photo or upload image</p>
                </div>
              )}
            </div>
          )}

          {/* Voice panel removed as requested; mic remains near Description */}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Issue Title</label>
            <div className="form-row-inline" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Brief title for the issue"
                value={reportData.title}
                onChange={(e) => setReportData(prev => ({...prev, title: e.target.value}))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  targetRef.current = 'title';
                  toggleListening();
                }}
                disabled={!isSpeechRecognitionAvailable}
                title={isSpeechRecognitionAvailable ? "Dictate title with your voice" : "Speech recognition not available. Please use text input."}
                style={{ minWidth: '120px', opacity: isSpeechRecognitionAvailable ? 1 : 0.5, cursor: isSpeechRecognitionAvailable ? 'pointer' : 'not-allowed' }}
              >
                {isListening && targetRef.current === 'title' ? 'Stop' : 'Speak'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <div className="form-row-inline" style={{ display: 'flex', gap: '0.5rem', alignItems: 'start' }}>
              <textarea
                className="form-input"
                rows="4"
                placeholder="Describe the issue in detail or use the mic to dictate"
                value={reportData.description}
                onChange={(e) => setReportData(prev => ({...prev, description: e.target.value}))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { targetRef.current = 'description'; toggleListening(); }}
                disabled={!isSpeechRecognitionAvailable}
                title={isSpeechRecognitionAvailable ? "Dictate with your voice" : "Speech recognition not available. Please use text input."}
                style={{ minWidth: '120px', opacity: isSpeechRecognitionAvailable ? 1 : 0.5, cursor: isSpeechRecognitionAvailable ? 'pointer' : 'not-allowed' }}
              >
                {isListening ? 'Stop' : 'Speak'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <div className="form-row-inline" style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter location or use GPS"
                value={reportData.location}
                onChange={(e) => setReportData(prev => ({...prev, location: e.target.value}))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleGetLocation}
                className="btn-secondary"
                style={{ 
                  padding: '1rem',
                  minWidth: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <MapPin size={16} />
                GPS
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReportIssue;