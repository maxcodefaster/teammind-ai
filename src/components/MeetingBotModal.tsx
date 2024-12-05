import { useState } from 'react';
import { supabaseBrowserClient } from '../utils/supabaseBrowser';

const ALLOWED_MEETING_DOMAINS = [
  'meet.google.com',
  'teams.microsoft.com',
  'zoom.us',
];

interface MeetingBotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MeetingBotModal({ isOpen, onClose }: MeetingBotModalProps) {
  const [botName, setBotName] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isValidMeetingUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return ALLOWED_MEETING_DOMAINS.some((domain) =>
        urlObj.hostname.endsWith(domain)
      );
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (!isValidMeetingUrl(meetingUrl)) {
      setError('Please enter a valid meeting URL from Google Meet, Microsoft Teams, or Zoom');
      setIsLoading(false);
      return;
    }

    try {
      // Create meeting bot via API
      const response = await fetch('/api/meeting/bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meeting_url: meetingUrl,
          bot_name: botName,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();

      // Store bot in database
      const { error: dbError } = await supabaseBrowserClient
        .from('meeting_bots')
        .insert({
          bot_id: data.bot_id,
          bot_name: botName,
          meeting_url: meetingUrl,
        });

      if (dbError) throw dbError;

      setSuccess('Bot created! It will join your meeting and create tasks from action items.');
      setBotName('');
      setMeetingUrl('');
      
      // Close modal after short delay to show success message
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting bot');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md transform transition-all">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Create Meeting Bot</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            disabled={isLoading}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <p className="text-gray-600 mb-4">
          Enter your meeting details and we will create tasks from action items.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="botName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Bot Name
            </label>
            <input
              type="text"
              id="botName"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="Enter bot name"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="meetingUrl"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Meeting URL
            </label>
            <input
              type="url"
              id="meetingUrl"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="Paste Google Meet, Microsoft Teams, or Zoom URL"
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-md">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Bot'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
