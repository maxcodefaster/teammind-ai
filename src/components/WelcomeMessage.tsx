import React from 'react';

const WelcomeMessage = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-600 p-8">
      <div className="w-16 h-16 mb-6">
        <img
          src="/teammind-ai-logo.svg"
          alt="TeamMind AI Logo"
          className="w-full h-full object-contain"
        />
      </div>
      <h2 className="text-2xl font-semibold mb-4">Welcome to TeamMind AI</h2>
      <p className="text-center max-w-lg mb-6">
        I'm here to help you with your tasks, answer questions, and collaborate on your projects. 
        Feel free to start a conversation!
      </p>
      <div className="bg-gray-100 p-4 rounded-lg">
        <p className="font-medium mb-2">Try asking about:</p>
        <ul className="space-y-2">
          <li>• Project management and organization</li>
          <li>• Team collaboration strategies</li>
          <li>• Meeting summaries and notes</li>
          <li>• Task prioritization</li>
        </ul>
      </div>
    </div>
  );
};

export default WelcomeMessage;