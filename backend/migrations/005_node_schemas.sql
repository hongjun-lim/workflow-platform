-- Migration: Add node_schemas table for schema-driven dynamic node configuration

CREATE TABLE IF NOT EXISTS node_schemas (
    type VARCHAR(100) PRIMARY KEY COMMENT 'Node type identifier, e.g. slack_message',
    label VARCHAR(255) NOT NULL COMMENT 'Display name, e.g. Slack Message',
    icon VARCHAR(20) NOT NULL DEFAULT '📦' COMMENT 'Emoji icon for UI',
    color VARCHAR(20) NOT NULL DEFAULT '#4299e1' COMMENT 'Node colour',
    category VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'Grouping label, e.g. Monitoring, Notifications',
    description TEXT COMMENT 'Short description shown in config drawer',
    auth_type VARCHAR(50) DEFAULT NULL COMMENT 'Required integration type (jira, slack, …) or NULL',
    fields JSON NOT NULL COMMENT 'Array of field definitions',
    execute_config JSON DEFAULT NULL COMMENT 'HTTP execution config for custom nodes',
    is_trigger BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'true = appears as trigger node',
    is_builtin BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'true = shipped with platform, false = user-created',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed built-in schemas

INSERT INTO node_schemas (type, label, icon, color, description, auth_type, is_trigger, fields) VALUES

('start', 'Start Trigger', '🚀', '#667eea', 'The starting point of the workflow.', NULL, TRUE, JSON_ARRAY(
  JSON_OBJECT('key','trigger_type','label','Trigger Type','type','select','required',TRUE,'default','schedule',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','🕐 Schedule','value','schedule'),
      JSON_OBJECT('label','⚡ Trigger','value','trigger')
    ),'group',''),
  JSON_OBJECT('key','cron_schedule','label','Cron Schedule','type','text','required',FALSE,'default','',
    'placeholder','e.g. */5 * * * * or @every 5m','group','',
    'show_if',JSON_OBJECT('field','trigger_type','value','schedule'))
)),

('jira_webhook', 'Jira Webhook Trigger', '🎫', '#0052CC', 'Triggers workflow when a Jira event occurs.', 'jira', TRUE, JSON_ARRAY(
  JSON_OBJECT('key','event_filter','label','Event Filter','type','select','required',FALSE,'default','',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','All Events','value',''),
      JSON_OBJECT('label','Issue Created','value','jira:issue_created'),
      JSON_OBJECT('label','Issue Updated','value','jira:issue_updated'),
      JSON_OBJECT('label','Issue Deleted','value','jira:issue_deleted')
    ),'group',''),
  JSON_OBJECT('key','jql_filter','label','JQL Filter (optional)','type','text','required',FALSE,'default','',
    'placeholder','e.g. project = WOP AND status = Open','group','')
)),

('http_request', 'HTTP Request', '🌐', '#4299e1', 'Make an HTTP request to any URL.', NULL, FALSE, JSON_ARRAY(
  JSON_OBJECT('key','method','label','Method','type','select','required',TRUE,'default','GET',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','GET','value','GET'),
      JSON_OBJECT('label','POST','value','POST'),
      JSON_OBJECT('label','PUT','value','PUT'),
      JSON_OBJECT('label','PATCH','value','PATCH'),
      JSON_OBJECT('label','DELETE','value','DELETE')
    ),'group',''),
  JSON_OBJECT('key','url','label','URL','type','text','required',TRUE,'default','',
    'placeholder','https://api.example.com/endpoint','group',''),
  JSON_OBJECT('key','headers_json','label','Headers (JSON)','type','code','required',FALSE,'default','',
    'placeholder','{"Authorization": "Bearer xxx"}','group',''),
  JSON_OBJECT('key','body','label','Request Body','type','code','required',FALSE,'default','',
    'placeholder','{"key": "value"}','group','',
    'show_if',JSON_OBJECT('field','method','value','POST,PUT,PATCH')),
  JSON_OBJECT('key','auth_type','label','Auth Type','type','select','required',FALSE,'default','none',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','None','value','none'),
      JSON_OBJECT('label','Bearer Token','value','bearer'),
      JSON_OBJECT('label','Basic Auth','value','basic'),
      JSON_OBJECT('label','API Key','value','api_key')
    ),'group','Authentication'),
  JSON_OBJECT('key','auth_token','label','Bearer Token','type','password','required',FALSE,'default','',
    'placeholder','Your bearer token','group','Authentication',
    'show_if',JSON_OBJECT('field','auth_type','value','bearer')),
  JSON_OBJECT('key','auth_username','label','Username','type','text','required',FALSE,'default','',
    'group','Authentication',
    'show_if',JSON_OBJECT('field','auth_type','value','basic')),
  JSON_OBJECT('key','auth_password','label','Password','type','password','required',FALSE,'default','',
    'group','Authentication',
    'show_if',JSON_OBJECT('field','auth_type','value','basic')),
  JSON_OBJECT('key','api_key_header','label','Header Name','type','text','required',FALSE,'default','X-API-Key',
    'group','Authentication',
    'show_if',JSON_OBJECT('field','auth_type','value','api_key')),
  JSON_OBJECT('key','api_key_value','label','API Key Value','type','password','required',FALSE,'default','',
    'group','Authentication',
    'show_if',JSON_OBJECT('field','auth_type','value','api_key')),
  JSON_OBJECT('key','timeout','label','Timeout (seconds)','type','number','required',FALSE,'default','30',
    'placeholder','30','group','Advanced')
)),

('jira_create_issue', 'Jira Create Issue', '📋', '#0052CC', 'Create a new issue in Jira.', 'jira', FALSE, JSON_ARRAY(
  JSON_OBJECT('key','jira_mode','label','Mode','type','select','required',TRUE,'default','basic',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','Basic (form fields)','value','basic'),
      JSON_OBJECT('label','Advanced (raw JSON)','value','advanced')
    ),'group',''),
  JSON_OBJECT('key','project_key','label','Project Key','type','text','required',TRUE,'default','',
    'placeholder','e.g. WOP','group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','issue_type','label','Issue Type','type','select','required',FALSE,'default','Task',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','Task','value','Task'),
      JSON_OBJECT('label','Bug','value','Bug'),
      JSON_OBJECT('label','Story','value','Story'),
      JSON_OBJECT('label','Epic','value','Epic'),
      JSON_OBJECT('label','Sub-task','value','Sub-task')
    ),'group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','summary','label','Summary','type','text','required',TRUE,'default','',
    'placeholder','Issue title — supports {{key}} template vars','group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','description','label','Description','type','textarea','required',FALSE,'default','',
    'placeholder','Issue description — supports {{key}} template vars','group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','priority','label','Priority','type','select','required',FALSE,'default','',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','(default)','value',''),
      JSON_OBJECT('label','Highest','value','Highest'),
      JSON_OBJECT('label','High','value','High'),
      JSON_OBJECT('label','Medium','value','Medium'),
      JSON_OBJECT('label','Low','value','Low'),
      JSON_OBJECT('label','Lowest','value','Lowest')
    ),'group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','assignee','label','Assignee (account ID)','type','text','required',FALSE,'default','',
    'placeholder','e.g. 5ac5b...','group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','labels','label','Labels (comma-separated)','type','text','required',FALSE,'default','',
    'placeholder','e.g. bug,urgent','group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','basic')),
  JSON_OBJECT('key','raw_payload','label','Raw JSON Payload','type','code','required',TRUE,'default','',
    'placeholder','{ "fields": { "project": { "key": "WOP" }, ... } }','group','',
    'show_if',JSON_OBJECT('field','jira_mode','value','advanced'))
)),

('slack_message', 'Slack Message', '💬', '#4A154B', 'Send a message to a Slack channel.', 'slack', FALSE, JSON_ARRAY(
  JSON_OBJECT('key','channel','label','Channel','type','text','required',TRUE,'default','',
    'placeholder','e.g. #general or C01ABCD1234','hint','Channel name (with #) or channel ID. Bot must be a member.','group',''),
  JSON_OBJECT('key','message','label','Message','type','textarea','required',TRUE,'default','',
    'placeholder','🚀 New issue!\n\nProject: {{project_key}}\nLink: {{self}}',
    'hint','Supports Slack mrkdwn formatting. Use {{key}} for template variables.','group',''),
  JSON_OBJECT('key','username','label','Bot Username Override','type','text','required',FALSE,'default','',
    'placeholder','Workflow Bot','group','Advanced'),
  JSON_OBJECT('key','icon_emoji','label','Icon Emoji','type','text','required',FALSE,'default','',
    'placeholder',':robot_face:','group','Advanced'),
  JSON_OBJECT('key','thread_ts','label','Thread Timestamp','type','text','required',FALSE,'default','',
    'placeholder','e.g. {{thread_ts}} or leave empty',
    'hint','Set to reply in a thread. Use {{thread_ts}} from a previous Slack response.','group','Advanced')
)),

('condition', 'Condition', '🔀', '#ed8936', 'Branch workflow based on a condition.', NULL, FALSE, JSON_ARRAY(
  JSON_OBJECT('key','condition_type','label','Condition Type','type','select','required',TRUE,'default','simple',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','Simple (field comparison)','value','simple'),
      JSON_OBJECT('label','Expression','value','expression')
    ),'group',''),
  JSON_OBJECT('key','field','label','Field','type','text','required',FALSE,'default','',
    'placeholder','e.g. status or issue.priority','group','',
    'show_if',JSON_OBJECT('field','condition_type','value','simple')),
  JSON_OBJECT('key','operator','label','Operator','type','select','required',FALSE,'default','equals',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','equals','value','equals'),
      JSON_OBJECT('label','not equals','value','not_equals'),
      JSON_OBJECT('label','contains','value','contains'),
      JSON_OBJECT('label','not contains','value','not_contains'),
      JSON_OBJECT('label','greater than','value','gt'),
      JSON_OBJECT('label','less than','value','lt'),
      JSON_OBJECT('label','is empty','value','is_empty'),
      JSON_OBJECT('label','is not empty','value','is_not_empty')
    ),'group','',
    'show_if',JSON_OBJECT('field','condition_type','value','simple')),
  JSON_OBJECT('key','compare_value','label','Compare Value','type','text','required',FALSE,'default','',
    'placeholder','Value to compare against','group','',
    'show_if',JSON_OBJECT('field','condition_type','value','simple')),
  JSON_OBJECT('key','expression','label','Expression','type','code','required',FALSE,'default','',
    'placeholder','e.g. input.status === "Done"','group','',
    'show_if',JSON_OBJECT('field','condition_type','value','expression'))
)),

('transform', 'Transform Data', '🔄', '#48bb78', 'Transform data between nodes.', NULL, FALSE, JSON_ARRAY(
  JSON_OBJECT('key','transform_type','label','Transform Type','type','select','required',TRUE,'default','jq',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','jq Expression','value','jq'),
      JSON_OBJECT('label','Field Mapping','value','mapping'),
      JSON_OBJECT('label','Template','value','template')
    ),'group',''),
  JSON_OBJECT('key','expression','label','jq Expression','type','code','required',FALSE,'default','.',
    'placeholder','. | {name: .user.name}','group','',
    'show_if',JSON_OBJECT('field','transform_type','value','jq')),
  JSON_OBJECT('key','mapping','label','Field Mapping (JSON)','type','code','required',FALSE,'default','',
    'placeholder','{"output_field": "input.nested.field"}','group','',
    'show_if',JSON_OBJECT('field','transform_type','value','mapping')),
  JSON_OBJECT('key','template','label','Template','type','code','required',FALSE,'default','',
    'placeholder','Hello {{name}}, your order {{order_id}} is ready.','group','',
    'show_if',JSON_OBJECT('field','transform_type','value','template'))
)),

('delay', 'Delay', '⏱️', '#9f7aea', 'Pause workflow execution for a duration.', NULL, FALSE, JSON_ARRAY(
  JSON_OBJECT('key','delay','label','Duration','type','number','required',TRUE,'default','5',
    'placeholder','5','group',''),
  JSON_OBJECT('key','delay_unit','label','Unit','type','select','required',TRUE,'default','s',
    'options',JSON_ARRAY(
      JSON_OBJECT('label','Milliseconds','value','ms'),
      JSON_OBJECT('label','Seconds','value','s'),
      JSON_OBJECT('label','Minutes','value','m'),
      JSON_OBJECT('label','Hours','value','h')
    ),'group','')
)),

('end', 'Output', '📤', '#f56565', 'The end node of the workflow.', NULL, FALSE, JSON_ARRAY(
  JSON_OBJECT('key','output_mapping','label','Output Mapping (JSON)','type','code','required',FALSE,'default','',
    'placeholder','{"result": "{{key}}"}',
    'hint','Optional: shape the final output of the workflow.','group','')
));
