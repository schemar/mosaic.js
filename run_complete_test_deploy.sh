#!/bin/sh

echo "=================================================================================================================================================================="
echo "START: node test/deployOpenSTOnTestNetNew.js"
echo "=================================================================================================================================================================="

source test/open_st_env_vars.sh
node test/deployAndFinalizeSimpleTokenContract.js

echo "=================================================================================================================================================================="
echo "END: node test/deployOpenSTOnTestNetNew.js"
echo "=================================================================================================================================================================="

echo "=================================================================================================================================================================="
echo "START: node tools/deploy/openst_value.js"
echo "=================================================================================================================================================================="

source test/open_st_env_vars.sh
node tools/deploy/openst_value.js

echo "=================================================================================================================================================================="
echo "END: node tools/deploy/openst_value.js"
echo "=================================================================================================================================================================="

echo "=================================================================================================================================================================="
echo "START: node tools/deploy/openst_utility.js"
echo "=================================================================================================================================================================="

source test/open_st_env_vars.sh
node tools/deploy/openst_utility.js

echo "=================================================================================================================================================================="
echo "END: node tools/deploy/openst_utility.js"
echo "=================================================================================================================================================================="

echo "=================================================================================================================================================================="
echo "START: node tools/deploy/register_utility_token_value.js"
echo "=================================================================================================================================================================="

source test/open_st_env_vars.sh
node tools/deploy/register_utility_token_value.js

echo "=================================================================================================================================================================="
echo "END: node tools/deploy/register_utility_token_value.js"
echo "=================================================================================================================================================================="

echo "=================================================================================================================================================================="
echo "START: node tools/deploy/init_member.js"
echo "=================================================================================================================================================================="

source test/open_st_env_vars.sh
node tools/deploy/init_member.js

echo "=================================================================================================================================================================="
echo "END: node tools/deploy/init_member.js"
echo "=================================================================================================================================================================="

echo "=================================================================================================================================================================="
echo "START: node services/inter_comm/stake_and_mint.js"
echo "=================================================================================================================================================================="

#source test/open_st_env_vars.sh
#node services/inter_comm/stake_and_mint.js &

#echo "=================================================================================================================================================================="
#echo "END: node services/inter_comm/stake_and_mint.js"
#echo "=================================================================================================================================================================="

#echo "=================================================================================================================================================================="
#echo "START: node tools/stake_and_mint.js"
#echo "=================================================================================================================================================================="

#source test/open_st_env_vars.sh
#node tools/stake_and_mint.js

#echo "=================================================================================================================================================================="
#echo "END: node tools/stake_and_mint.js"
#echo "=================================================================================================================================================================="

