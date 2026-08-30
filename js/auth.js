// auth.js
// Controls login.html: switching between the Log In / Create Account
// forms, submitting them through js/supabase.js, and showing friendly
// success/error messages. Redirects straight to home.html if a
// session already exists, so a signed-in visitor never sees this form.

redirectIfAuthed();

const loginForm = document.getElementById("loginForm");
const signUpForm = document.getElementById("signUpForm");
const showSignUpBtn = document.getElementById("showSignUpBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const authMessage = document.getElementById("authMessage");

function showAuthMessage(text, isError) {
  authMessage.textContent = text;
  authMessage.classList.toggle("error", Boolean(isError));
  authMessage.hidden = false;
}

function hideAuthMessage() {
  authMessage.hidden = true;
}

showSignUpBtn.addEventListener("click", function () {
  loginForm.hidden = true;
  signUpForm.hidden = false;
  hideAuthMessage();
});

showLoginBtn.addEventListener("click", function () {
  signUpForm.hidden = true;
  loginForm.hidden = false;
  hideAuthMessage();
});

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();
  hideAuthMessage();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  logIn(email, password)
    .then(function () {
      window.location.href = "home.html";
    })
    .catch(function (error) {
      showAuthMessage(error.message, true);
    });
});

signUpForm.addEventListener("submit", function (event) {
  event.preventDefault();
  hideAuthMessage();

  const displayName = document.getElementById("signUpName").value.trim();
  const email = document.getElementById("signUpEmail").value.trim();
  const password = document.getElementById("signUpPassword").value;

  signUp(email, password, displayName)
    .then(function (data) {
      if (data.access_token) {
        // Email confirmation is off in the Supabase dashboard, so the
        // account already has a session — go straight in.
        window.location.href = "home.html";
        return;
      }

      // Email confirmation is on — there's no session yet.
      showAuthMessage("Yay, account created! Please check your email to confirm it, then log in 💗", false);
      signUpForm.reset();
      signUpForm.hidden = true;
      loginForm.hidden = false;
    })
    .catch(function (error) {
      showAuthMessage(error.message, true);
    });
});
