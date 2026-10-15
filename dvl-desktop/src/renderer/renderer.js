const openButton = document.getElementById('openProject');
const projectPath = document.getElementById('projectPath');
const projectId = document.getElementById('projectId');
const recentProjects = document.getElementById('recentProjects');
const saveSettingButton = document.getElementById('saveSetting');
const saveSecretButton = document.getElementById('saveSecret');
const deleteSecretButton = document.getElementById('deleteSecret');
const secretStatus = document.getElementById('secretStatus');

function renderActiveProject(project) {
  if (!project) {
    projectPath.textContent = 'No project selected';
    projectId.textContent = '';
    return;
  }

  projectPath.textContent = project.path;
  projectId.textContent = project.projectId;
}

async function renderRecentProjects() {
  const projects = await window.dvl.listRecentProjects();
  recentProjects.innerHTML = '';

  if (!projects || projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-path';
    empty.textContent = 'None yet';
    recentProjects.appendChild(empty);
    return;
  }

  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'recent-item';

    const name = document.createElement('div');
    name.className = 'recent-name';
    name.textContent = project.displayName;

    const path = document.createElement('div');
    path.className = 'recent-path';
    path.textContent = project.available ? project.path : `${project.path} (missing)`;

    row.appendChild(name);
    row.appendChild(path);

    if (project.available) {
      row.addEventListener('click', () => runUiAction(async () => {
        const selected = await window.dvl.openRecentProject(project.projectId);
        if (selected) {
          renderActiveProject(selected);
        } else {
          showUiError('Project unavailable.');
        }
        await renderRecentProjects();
      }));
    }

    recentProjects.appendChild(row);
  }
}

async function refreshSecretStatus() {
  const status = await window.dvl.hasSecret('b8_test_secret');
  secretStatus.textContent = !status.configured ? 'Not configured' :
    status.decryptable ? 'Configured (verified)' : 'Configured (unreadable)';
}

async function loadInitialState() {
  const lastProject = await window.dvl.getLastProject();
  renderActiveProject(lastProject);
  await renderRecentProjects();
  await refreshSecretStatus();
}

function showUiError(message) {
  document.getElementById('appStatus').textContent = message;
}

async function runUiAction(action) {
  showUiError('');
  try { await action(); } catch (_) {
    showUiError('Action failed. Check DVL logs.');
  }
}

openButton.addEventListener('click', () => runUiAction(async () => {
  const result = await window.dvl.openProject();

  if (!result || result.canceled || !result.project) {
    return;
  }

  renderActiveProject(result.project);
  await renderRecentProjects();
}));

saveSettingButton.addEventListener('click', () => runUiAction(async () => {
  await window.dvl.setSetting('b8_test_setting', {
    savedAt: new Date().toISOString()
  });
  saveSettingButton.textContent = 'Saved ✓';
}));

saveSecretButton.addEventListener('click', () => runUiAction(async () => {
  await window.dvl.setSecret('b8_test_secret', 'DVL_B8_SECRET_TEST_VALUE_2026');
  await refreshSecretStatus();
}));

deleteSecretButton.addEventListener('click', () => runUiAction(async () => {
  await window.dvl.deleteSecret('b8_test_secret');
  await refreshSecretStatus();
}));

runUiAction(loadInitialState);
