// Registration form navigation and validation
let currentStep = 1;
const totalSteps = 3;

// Update progress indicators
function updateProgress() {
  // Update step indicators
  for (let i = 1; i <= totalSteps; i++) {
    const indicator = document.getElementById(`step${i}-indicator`);
    const stepDiv = document.getElementById(`step${i}`);
    
    if (i < currentStep) {
      indicator.classList.add('completed');
      indicator.classList.remove('active');
    } else if (i === currentStep) {
      indicator.classList.add('active');
      indicator.classList.remove('completed');
    } else {
      indicator.classList.remove('active', 'completed');
    }
    
    if (i === currentStep) {
      stepDiv.style.display = 'block';
    } else {
      stepDiv.style.display = 'none';
    }
  }
  
  // Update progress bar width
  const progressBar = document.querySelector('.progress-bar::after');
  const width = ((currentStep - 1) / (totalSteps - 1)) * 100;
  if (progressBar) {
    progressBar.style.width = `${width}%`;
  }
}

// Go to next step
function nextStep() {
  if (validateStep(currentStep)) {
    currentStep++;
    if (currentStep <= totalSteps) {
      updateProgress();
      if (currentStep === 3) {
        updateReview();
      }
    }
  }
}

// Go to previous step
function prevStep() {
  currentStep--;
  updateProgress();
}

// Validate current step
function validateStep(step) {
  let isValid = true;
  
  // Clear previous errors
  const errorMessages = document.querySelectorAll('.error-message');
  errorMessages.forEach(msg => msg.textContent = '');
  
  if (step === 1) {
    // Validate step 1
    const name = document.getElementById('name');
    const description = document.getElementById('description');
    const category = document.getElementById('category');
    
    if (!name.value.trim()) {
      document.getElementById('name-error').textContent = 'Name is required';
      isValid = false;
    }
    
    if (!description.value.trim()) {
      document.getElementById('description-error').textContent = 'Description is required';
      isValid = false;
    }
    
    if (!category.value) {
      document.getElementById('category-error').textContent = 'Category is required';
      isValid = false;
    }
  } else if (step === 2) {
    // Validate step 2
    const endpointUrl = document.getElementById('endpoint_url');
    const capabilities = document.getElementById('capabilities');
    
    if (!endpointUrl.value.trim()) {
      document.getElementById('endpoint_url-error').textContent = 'Endpoint URL is required';
      isValid = false;
    } else if (!isValidUrl(endpointUrl.value)) {
      document.getElementById('endpoint_url-error').textContent = 'Please enter a valid URL (include http:// or https://)';
      isValid = false;
    }
    
    const healthUrl = document.getElementById('health_endpoint_url');
    if (healthUrl.value && !isValidUrl(healthUrl.value)) {
      document.getElementById('health_endpoint_url-error').textContent = 'Please enter a valid URL';
      isValid = false;
    }
    
    if (!capabilities.value.trim()) {
      document.getElementById('capabilities-error').textContent = 'Capabilities are required';
      isValid = false;
    }
  }
  
  return isValid;
}

// Update review section with form data
function updateReview() {
  const form = document.getElementById('registrationForm');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  
  // Update review fields
  document.getElementById('review-name').textContent = data.name || '';
  document.getElementById('review-description').textContent = data.description || '';
  document.getElementById('review-category').textContent = data.category || '';
  document.getElementById('review-endpoint_url').textContent = data.endpoint_url || '';
  document.getElementById('review-health_endpoint_url').textContent = data.health_endpoint_url || 'Not provided';
  document.getElementById('review-capabilities').textContent = data.capabilities || '';
}

// Validate URL format
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// Handle form submission
document.getElementById('registrationForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  if (!validateStep(currentStep)) {
    return;
  }
  
  // Show loading state
  const submitBtn = this.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Submitting...';
  submitBtn.disabled = true;
  
  try {
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());
    
    // Convert capabilities to array
    data.capabilities = data.capabilities.split(',').map(cap => cap.trim()).filter(cap => cap);
    
    // For now, we'll just log the data since the form is public
    // In a real implementation, this would POST to /api/agents
    console.log('Form data:', data);
    
    // Show success message
    alert('Registration form submitted successfully!\n\nNote: This is a demo form. In the full implementation, your agent would be registered on AgentX Market.');
    
    // Reset form
    this.reset();
    currentStep = 1;
    updateProgress();
    
  } catch (error) {
    console.error('Submission error:', error);
    alert('Error submitting registration: ' + error.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

// Initialize
updateProgress();