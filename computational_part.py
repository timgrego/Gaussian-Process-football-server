import numpy as np
import torch
import gpytorch
from gpytorch.likelihoods import MultitaskGaussianLikelihood
from sklearn.preprocessing import StandardScaler
from sklearn.preprocessing import MinMaxScaler
from gpytorch.models import ExactGP
from gpytorch.likelihoods import MultitaskGaussianLikelihood
from gpytorch.means import MultitaskMean, ConstantMean
from gpytorch.kernels import ScaleKernel, PeriodicKernel, LCMKernel

num_tasks = 22

class MultitaskGPModel(ExactGP):
    def __init__(self, train_x, train_y, likelihood, num_tasks):
        super(MultitaskGPModel, self).__init__(train_x, train_y, likelihood)
        self.mean_module = MultitaskMean(ConstantMean(), num_tasks=num_tasks)
        self.covar_module = LCMKernel(
            base_kernels=[ScaleKernel(PeriodicKernel())],
            num_tasks=num_tasks, rank=1
        )

    def forward(self, x):
        mean_x = self.mean_module(x)
        covar_x = self.covar_module(x)
        return gpytorch.distributions.MultitaskMultivariateNormal(mean_x, covar_x)
    

likelihood_state_path = 'states/likelihood_state_dict3-2.pth'
model_state_path = 'states/model_state_dict3-2.pth'

likelihood = MultitaskGaussianLikelihood(num_tasks=num_tasks)
model = MultitaskGPModel(train_x=None, train_y=None, likelihood=likelihood, num_tasks=num_tasks)
model.load_state_dict(torch.load(model_state_path))
likelihood.load_state_dict(torch.load(likelihood_state_path))

assumed_mean = [torch.tensor(0.1244),
 torch.tensor(0.4864),
 torch.tensor(0.4605),
 torch.tensor(0.8302),
 torch.tensor(0.3966),
 torch.tensor(0.6527),
 torch.tensor(0.4025),
 torch.tensor(0.4870),
 torch.tensor(0.4146),
 torch.tensor(0.3030),
 torch.tensor(0.5658),
 torch.tensor(0.5381),
 torch.tensor(0.8938),
 torch.tensor(0.5175),
 torch.tensor(0.6742),
 torch.tensor(0.3711),
 torch.tensor(0.6823),
 torch.tensor(0.5472),
 torch.tensor(0.6607),
 torch.tensor(0.6392),
 torch.tensor(0.5480),
 torch.tensor(0.3216)]

assumed_std = [torch.tensor(0.0827),
 torch.tensor(0.0540),
 torch.tensor(0.1693),
 torch.tensor(0.1695),
 torch.tensor(0.1955),
 torch.tensor(0.1685),
 torch.tensor(0.2074),
 torch.tensor(0.1436),
 torch.tensor(0.1703),
 torch.tensor(0.1397),
 torch.tensor(0.2943),
 torch.tensor(0.3141),
 torch.tensor(0.0791),
 torch.tensor(0.0821),
 torch.tensor(0.1714),
 torch.tensor(0.1472),
 torch.tensor(0.1527),
 torch.tensor(0.1350),
 torch.tensor(0.1745),
 torch.tensor(0.2257),
 torch.tensor(0.2032),
 torch.tensor(0.2299)]

scaler_x = MinMaxScaler()

feature_scalers = []
for i in range(num_tasks):
    scaler = StandardScaler()
    synthetic_data = np.random.normal(loc=assumed_mean[i], scale=assumed_std[i], size=(1, 1))
    scaler.fit(synthetic_data)
    feature_scalers.append(scaler)

likelihood.eval()

device = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')

model.float()
model.to(device)
model.eval()

dummy_x = torch.zeros(1, 1, dtype=torch.float16).to(device)

scaler_x.fit_transform(dummy_x)

with torch.no_grad(), gpytorch.settings.fast_pred_var():
    _ = model(dummy_x)

def update_pos(fi_kx_idx, fi_ky_idx, fj_kx, fj_ky, fj_k1x, fj_k1y, i, j, frame_k, frame_k1):
    
    # Scale frames
    frame_k_scaled = torch.tensor(scaler_x.transform([[frame_k]]), dtype=torch.float32).squeeze()
    frame_k1_scaled = torch.tensor(scaler_x.transform([[frame_k1]]), dtype=torch.float32).squeeze()
    x_combined = torch.stack([frame_k_scaled, frame_k1_scaled])
    
    # Indices for player i and j
    i_x_idx = i  # Adjusted indexing
    i_y_idx = i + 1
    j_x_idx = j
    j_y_idx = j + 1
    
    # Scale observations using individual scalers
    fi_kx_scaled = feature_scalers[i_x_idx].transform([[fi_kx_idx]])[0][0]
    fi_ky_scaled = feature_scalers[i_y_idx].transform([[fi_ky_idx]])[0][0]
    fj_kx_scaled = feature_scalers[j_x_idx].transform([[fj_kx]])[0][0]
    fj_ky_scaled = feature_scalers[j_y_idx].transform([[fj_ky]])[0][0]
    fj_k1x_scaled = feature_scalers[j_x_idx].transform([[fj_k1x]])[0][0]
    fj_k1y_scaled = feature_scalers[j_y_idx].transform([[fj_k1y]])[0][0]
    
    # Convert to tensors with correct dtype
    observed_Yo = torch.tensor([fi_kx_scaled, fi_ky_scaled, fj_kx_scaled, fj_ky_scaled, fj_k1x_scaled, fj_k1y_scaled], dtype=torch.float32)
    
    with torch.no_grad(), gpytorch.settings.fast_pred_var():
        predictions = model(x_combined)
        mean = predictions.mean.float()
        cov = predictions.covariance_matrix.float()
    

    mean_Yo = torch.stack([
        mean[0, i_x_idx],
        mean[0, i_y_idx],
        mean[0, j_x_idx],
        mean[0, j_y_idx],
        mean[1, j_x_idx], 
        mean[1, j_y_idx]
    ])
    
    mean_Yp = torch.stack([
        mean[1, i_x_idx],
        mean[1, i_y_idx]
    ])
    
    # Indices for observed and prediction variables
    num_tasks = mean.size(1)
    idx_Yo = [i_x_idx, i_y_idx, num_tasks + j_x_idx, num_tasks + j_y_idx, num_tasks + j_x_idx, num_tasks + j_y_idx]
    idx_Yp = [num_tasks + i_x_idx, num_tasks + i_y_idx]
    
    # Extract covariance submatrices
    cov_YoYo = cov[idx_Yo][:, idx_Yo]
    cov_YpYo = cov[idx_Yp][:, idx_Yo]
    cov_YpYp = cov[idx_Yp][:, idx_Yp]
    
    # Compute conditional mean and covariance
    cov_YoYo_inv = torch.inverse(cov_YoYo + 1e-6 * torch.eye(len(idx_Yo), dtype=torch.float32))
    cond_mean = mean_Yp + cov_YpYo @ cov_YoYo_inv @ (observed_Yo - mean_Yo)
    cond_cov = cov_YpYp - cov_YpYo @ cov_YoYo_inv @ cov_YpYo.t()
    
    # Ensure positive semi-definite covariance
    cond_cov = (cond_cov + cond_cov.t()) / 2
    eigenvalues = torch.linalg.eigvalsh(cond_cov)
    min_eigenvalue = eigenvalues.min().item()
    if min_eigenvalue < 0:
        cond_cov += (-min_eigenvalue + 1e-6) * torch.eye(cond_cov.size(0), dtype=torch.float32)
    
    # Sample from the conditional distribution
    sampled_positions = torch.distributions.MultivariateNormal(cond_mean, cond_cov).sample()
    
    # Unscale the sampled positions
    unscaled_fix = feature_scalers[i_x_idx].inverse_transform([[sampled_positions[0].item()]])[0][0]
    unscaled_fiy = feature_scalers[i_y_idx].inverse_transform([[sampled_positions[1].item()]])[0][0]
    
    return (unscaled_fix, unscaled_fiy)




